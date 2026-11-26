import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { attendanceTimers, timers } from "@/platform/db/schema";
import type { RecordData } from "@/shared/contracts";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  invalidateWorkspace: vi.fn(),
  invalidateTimer: vi.fn(),
}));
vi.mock("@/platform/db", () => ({
  db: { transaction: mock.transaction, delete: () => ({ where: mock.remove }) },
}));
vi.mock("@/modules/records/repository", () => ({
  assertProject: async (_context: Context, id: string) =>
    id === "play" ? { id, data: { title: "Der Sturm" } } : undefined,
}));
vi.mock("@/modules/categories/service", () => ({ validateCategoryReferences: vi.fn() }));
vi.mock("@/modules/records/service", () => ({ saveRecord: mock.save }));
vi.mock("@/modules/records/workspace", () => ({
  invalidateWorkspace: mock.invalidateWorkspace,
  invalidateTimer: mock.invalidateTimer,
}));
import { timerAction } from "@/modules/time-tracking/timer";
import {
  coupledTimer,
  defaultTimerTitle,
  timerLockOrder,
  timerStopEnd,
} from "@/modules/time-tracking/timer-coupling";

type Row = { id: string; userId: string; departmentId: string; data: RecordData };
const context = { user: { id: "u", role: "user" }, departmentId: "makeup" } as Context;
const dialect = new PgDialect();
const params = (condition: SQL) => dialect.sqlToQuery(condition).params;

function fixture(initial: { time?: RecordData; attendance?: RecordData } = {}) {
  const store: Record<"time" | "attendance", Row[]> = { time: [], attendance: [] };
  for (const kind of ["time", "attendance"] as const)
    if (initial[kind])
      store[kind].push({
        id: `${kind}-1`,
        userId: "u",
        departmentId: "makeup",
        data: initial[kind]!,
      });
  const locks: string[] = [];
  const kindOf = (table: unknown) =>
    table === timers ? "time" : table === attendanceTimers ? "attendance" : undefined;
  const thenable = <T>(run: () => Promise<T>) => ({
    then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) =>
      run().then(resolve, reject),
  });
  const tx = {
    execute: async (query: SQL) => {
      locks.push(String(params(query)[0]));
    },
    select: () => ({
      from: (table: unknown) => {
        const kind = kindOf(table);
        const rows = async () =>
          kind
            ? store[kind].filter((row) => row.userId === "u")
            : [{ id: "c", data: { scope: "time", key: "cleaning", name: "Aufräumen" } }];
        const query = { where: () => query, for: rows, ...thenable(rows) };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        returning: async () => {
          store[kindOf(table)!].push(values);
          return [values];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Partial<Row>) => ({
        where: (condition: SQL) => {
          const run = async () => {
            const row = store[kindOf(table)!].find((item) => params(condition).includes(item.id));
            if (row) Object.assign(row, values);
            return row ? [row] : [];
          };
          return { returning: run, ...thenable(run) };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        store[kindOf(table)!].length = 0;
      },
    }),
  };
  mock.transaction.mockImplementation(async (callback) => callback(tx));
  return { store, locks };
}

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

describe("coupled attendance and production timers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.save.mockImplementation(async (_context, kind, data) => ({ id: "booking", kind, data }));
  });

  it("locks attendance before production for every coupled action", () => {
    expect(coupledTimer("time", "timer-start")).toBe("attendance");
    expect(coupledTimer("time", "timer-resume")).toBe("attendance");
    expect(coupledTimer("attendance", "timer-pause")).toBe("time");
    expect(coupledTimer("attendance", "timer-resume")).toBeUndefined();
    expect(coupledTimer("attendance", "timer-stop")).toBeUndefined();
    expect(coupledTimer("time", "timer-stop")).toBeUndefined();
    expect(timerLockOrder("time", "timer-start")).toEqual(["attendance", "time"]);
    expect(timerLockOrder("attendance", "timer-pause")).toEqual(["attendance", "time"]);
    expect(timerLockOrder("time", "timer-stop")).toEqual(["time"]);
  });

  it("starts attendance with production in the same transaction and returns both timers", async () => {
    const { store, locks } = fixture();
    const result = (await timerAction(
      context,
      "timer-start",
      { productionId: "play", category: "production" },
      "time",
    )) as Row & { attendanceTimer: Row; attendanceStarted: boolean };
    expect(locks).toEqual(["attendance:timer:u", "time:timer:u"]);
    expect(result.data.title).toBe("Der Sturm");
    expect(result.attendanceStarted).toBe(true);
    expect(result.attendanceTimer.data).toMatchObject({ title: "Anwesenheit", pausedAt: null });
    expect(store.attendance).toHaveLength(1);
    expect(store.time).toHaveLength(1);
    // Timers stay in the personal cache; the coupling adds no department-wide signal.
    expect(mock.invalidateTimer).toHaveBeenCalledWith("u");
    for (const call of mock.invalidateWorkspace.mock.calls)
      expect(call[2]).not.toContain("attendance");
  });

  it("names general work after the work area and keeps a typed activity", async () => {
    fixture();
    const general = (await timerAction(context, "timer-start", { category: "cleaning" })) as Row;
    expect(general.data.title).toBe("Aufräumen");
    fixture();
    const typed = (await timerAction(context, "timer-start", {
      title: " Perücke ",
      productionId: "play",
    })) as Row;
    expect(typed.data.title).toBe("Perücke");
    expect(defaultTimerTitle("time", "", "", "")).toBe("Arbeitszeit");
    expect(defaultTimerTitle("attendance", "")).toBe("Anwesenheit");
  });

  it("leaves running attendance alone and resumes paused attendance", async () => {
    const started = ago(2);
    const running = fixture({
      attendance: { title: "Anwesenheit", startedAt: started, pausedAt: null },
    });
    const first = (await timerAction(context, "timer-start", { productionId: "play" })) as {
      attendanceStarted?: boolean;
      attendanceResumed?: boolean;
    };
    expect(first.attendanceStarted).toBeUndefined();
    expect(first.attendanceResumed).toBeUndefined();
    expect(running.store.attendance[0].data).toMatchObject({ startedAt: started, pausedAt: null });
    const paused = fixture({
      attendance: { title: "Anwesenheit", startedAt: ago(3), pausedAt: ago(1), pauseSeconds: 60 },
    });
    const second = (await timerAction(context, "timer-start", { productionId: "play" })) as {
      attendanceResumed?: boolean;
    };
    expect(second.attendanceResumed).toBe(true);
    expect(paused.store.attendance[0].data.pausedAt).toBeNull();
    expect(Number(paused.store.attendance[0].data.pauseSeconds)).toBeGreaterThanOrEqual(3660);
  });

  it("pauses production with attendance but does not resume it with attendance", async () => {
    const { store, locks } = fixture({
      attendance: { title: "Anwesenheit", startedAt: ago(2), pausedAt: null },
      time: { title: "Der Sturm", startedAt: ago(1), pausedAt: null },
    });
    const paused = (await timerAction(context, "timer-pause", {}, "attendance")) as {
      productionPaused?: boolean;
    };
    expect(locks).toEqual(["attendance:timer:u", "time:timer:u"]);
    expect(paused.productionPaused).toBe(true);
    expect(store.time[0].data.pausedAt).toEqual(expect.any(String));
    await timerAction(context, "timer-resume", {}, "attendance");
    expect(store.attendance[0].data.pausedAt).toBeNull();
    expect(store.time[0].data.pausedAt).toEqual(expect.any(String));
  });

  it("never stops attendance when production stops", async () => {
    const { store } = fixture({
      attendance: { title: "Anwesenheit", startedAt: ago(2), pausedAt: null },
      time: { title: "Der Sturm", startedAt: ago(1), pausedAt: null, pauseSeconds: 0 },
    });
    const booking = (await timerAction(context, "timer-stop", {}, "time")) as { kind: string };
    expect(booking.kind).toBe("time");
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(store.attendance).toHaveLength(1);
  });

  it("books a forgotten timer up to a corrected end time", async () => {
    fixture({
      attendance: { title: "Anwesenheit", startedAt: ago(14), pausedAt: null, pauseSeconds: 0 },
    });
    const end = ago(6);
    await timerAction(context, "timer-stop", { end }, "attendance");
    expect(mock.save.mock.calls[0][2]).toMatchObject({ end, durationSeconds: 8 * 3600 });
    const now = new Date().toISOString();
    const data = { startedAt: ago(3) };
    expect(() => timerStopEnd(data, ago(4), now)).toThrow(
      "Die Endzeit muss nach dem Start liegen.",
    );
    expect(() => timerStopEnd(data, ago(-1), now)).toThrow("nicht in der Zukunft");
    expect(() => timerStopEnd(data, "kaputt", now)).toThrow("gültige Endzeit");
    expect(timerStopEnd(data, undefined, now)).toBe(now);
    const pausedAt = ago(2);
    expect(timerStopEnd({ ...data, pausedAt }, ago(1), now)).toBe(pausedAt);
    expect(timerStopEnd({ ...data, stoppedAt: "reserved" }, ago(1), now)).toBe("reserved");
  });
});
