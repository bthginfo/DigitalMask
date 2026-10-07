import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { memberships, records } from "@/platform/db/schema";
import { shiftSwapSchema } from "@/modules/shift-swaps/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  emit: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/records/repository", () => ({
  findRecord: mocks.find,
  serialize: (row: { createdAt: Date; updatedAt: Date }) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }),
}));
vi.mock("@/platform/events", () => ({
  emit: mocks.emit,
  auditChange: mocks.audit,
  scheduleEvents: mocks.schedule,
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mocks.invalidate }));
import { createShiftSwap, decideShiftSwap } from "@/modules/shift-swaps/service";

type Row = typeof records.$inferSelect;
const admin = {
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  user: { id: "admin", role: "admin" },
} as Context;
const user = (id: string) => ({ ...admin, user: { id, role: "user" } }) as Context;
const first = "2026-10-20T07:00:00.000Z",
  last = "2026-10-20T15:00:00.000Z";
function fixture(reciprocal = false, recurring = false) {
  const logs: string[] = [];
  const stored = new Map<string, Row>();
  const make = (id: string, kind: Row["kind"], data: Row["data"]): Row => ({
    id,
    kind,
    data,
    version: 1,
    departmentId: admin.departmentId,
    organizationId: admin.organizationId,
    createdBy: "a",
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-01T08:00:00Z"),
    ownerId: null,
    productionId: null,
    parentId: null,
    startAt: null,
    endAt: null,
  });
  const event = make("a-duty", "events", {
    start: recurring ? "2026-10-13T07:00:00.000Z" : first,
    end: recurring ? "2026-10-13T15:00:00.000Z" : last,
    title: "Fiktiver Dienst",
    participantIds: ["a"],
    category: "service",
    allDay: false,
    recurrence: recurring ? "weekly" : "none",
    until: recurring ? "2026-11-30" : "",
    exceptions: [],
    productionId: "",
    leaveId: "",
  });
  stored.set(event.id, event);
  if (reciprocal)
    stored.set(
      "b-duty",
      make("b-duty", "events", {
        ...event.data,
        start: "2026-10-21T07:00:00.000Z",
        end: "2026-10-21T15:00:00.000Z",
        participantIds: ["b"],
        recurrence: "none",
        until: "",
      }),
    );
  stored.set(
    "request",
    make(
      "request",
      "shiftSwaps",
      shiftSwapSchema.parse({
        requesterId: "a",
        partnerId: "b",
        serviceId: event.id,
        serviceVersion: 1,
        serviceStart: first,
        serviceEnd: last,
        serviceTitle: "Fiktiver Dienst",
        status: "awaiting_admin",
        requestedAt: "2026-10-07T08:00:00.000Z",
        partnerDecidedAt: "2026-10-07T09:00:00.000Z",
        ...(reciprocal
          ? {
              counterServiceId: "b-duty",
              counterServiceVersion: 1,
              counterServiceStart: "2026-10-21T07:00:00.000Z",
              counterServiceEnd: "2026-10-21T15:00:00.000Z",
              counterServiceTitle: "Gegendienst",
            }
          : {}),
      }),
    ),
  );
  const people = [
    { id: "a", role: "user" },
    { id: "b", role: "user" },
    { id: "admin", role: "admin" },
  ];
  const dialect = new PgDialect();
  function result<T>(items: T[]) {
    const promise = Promise.resolve(items);
    return {
      then: promise.then.bind(promise),
      limit: (count: number) => result(items.slice(0, count)),
      orderBy: () => result(items),
      for: () => result(items),
    };
  }
  const tx = {
    execute: async (query: SQL) => {
      logs.push(`lock:${dialect.sqlToQuery(query).params[0]}`);
    },
    select: () => ({
      from: (table: unknown) => ({
        where: (query: SQL) => {
          const { params } = dialect.sqlToQuery(query);
          if (table === memberships)
            return result(
              params.includes("superadmin")
                ? people.filter((person) => params.includes(person.id))
                : people.filter((person) => person.role === "admin"),
            );
          return result([...stored.values()].filter((row) => params.includes(row.kind)));
        },
      }),
    }),
    update: () => ({
      set: (values: Partial<Row>) => ({
        where: (query: SQL) => ({
          returning: async () => {
            const { params } = dialect.sqlToQuery(query);
            const before = stored.get(String(params[0]));
            if (!before || before.version !== params[1]) return [];
            const after = { ...before, ...values };
            stored.set(after.id, after);
            logs.push(`write:${after.id}`);
            return [after];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Row) => ({
        returning: async () => {
          const after = { ...make(values.id, values.kind, values.data), ...values };
          stored.set(after.id, after);
          logs.push(`create:${after.kind}`);
          return [after];
        },
      }),
    }),
  };
  mocks.find.mockImplementation(async (_context, id, kind, _tx, locked) => {
    logs.push(`load:${id}:${locked ? "locked" : "read"}`);
    const row = stored.get(id);
    if (!row || row.kind !== kind) throw new Error("Fictional record missing");
    return structuredClone(row);
  });
  mocks.transaction.mockImplementation(async (run) => {
    const snapshot = structuredClone(stored);
    try {
      return await run(tx);
    } catch (error) {
      stored.clear();
      for (const [id, row] of snapshot) stored.set(id, row);
      throw error;
    }
  });
  return { stored, logs, make, people };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("atomic shift-swap service", () => {
  it("locks calendar before record loads and applies both reciprocal duties together", async () => {
    const data = fixture(true);
    const result = await decideShiftSwap(admin, "request", { action: "approve", version: 1 });
    expect(result.data.status).toBe("approved");
    expect(data.logs[0]).toBe("lock:fictional-makeup:calendar");
    expect(data.logs.indexOf("load:a-duty:locked")).toBeLessThan(
      data.logs.indexOf("load:b-duty:locked"),
    );
    expect(data.stored.get("a-duty")!.data.participantIds).toEqual(["b"]);
    expect(data.stored.get("b-duty")!.data.participantIds).toEqual(["a"]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), admin, "events.updated", "a-duty");
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      admin,
      "ShiftSwapChangedV1",
      expect.objectContaining({ title: "Diensttausch genehmigt", userIds: ["a", "b"] }),
    );
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it("changes only a selected recurring occurrence using an exception and one-off replacement", async () => {
    const data = fixture(false, true);
    await decideShiftSwap(admin, "request", { action: "approve", version: 1 });
    const series = data.stored.get("a-duty")!;
    expect(series.data.participantIds).toEqual(["a"]);
    expect(series.data.exceptions).toEqual(["2026-10-20"]);
    const replacement = [...data.stored.values()].find(
      (row) => row.kind === "events" && row.id !== series.id,
    )!;
    expect(replacement.data).toMatchObject({
      recurrence: "none",
      participantIds: ["b"],
      start: first,
      end: last,
      until: "",
      exceptions: [],
    });
  });
  it("rejects stale duty versions without a partial calendar or request update", async () => {
    const data = fixture(true);
    data.stored.get("b-duty")!.version = 2;
    await expect(
      decideShiftSwap(admin, "request", { action: "approve", version: 1 }),
    ).rejects.toThrow("seit der Anfrage geändert");
    expect(data.stored.get("a-duty")!.data.participantIds).toEqual(["a"]);
    expect(data.stored.get("request")!.data.status).toBe("awaiting_admin");
    expect(data.logs.filter((log) => log.startsWith("write:"))).toEqual([]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("checks all-day absences and never exposes another production's name in its conflict error", async () => {
    const data = fixture();
    data.stored.set(
      "absence",
      data.make("absence", "events", {
        title: "PRIVATE PRODUCTION",
        participantIds: ["b"],
        start: "2026-10-19T22:00:00.000Z",
        end: "2026-10-20T22:00:00.000Z",
        category: "vacation",
        allDay: true,
        recurrence: "none",
      }),
    );
    await expect(
      decideShiftSwap(admin, "request", { action: "approve", version: 1 }),
    ).rejects.toThrow("Zeitkonflikt");
    expect(data.stored.get("a-duty")!.data.participantIds).toEqual(["a"]);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("allows colleague consent without changing calendar entries and blocks an admin before consent", async () => {
    const data = fixture();
    data.stored.get("request")!.data.status = "awaiting_partner";
    await expect(
      decideShiftSwap(admin, "request", { action: "approve", version: 1 }),
    ).rejects.toThrow("Zuerst");
    await decideShiftSwap(user("b"), "request", { action: "accept", version: 1 });
    expect(data.stored.get("request")!.data.status).toBe("awaiting_admin");
    expect(data.stored.get("a-duty")!.version).toBe(1);
    expect(data.stored.get("a-duty")!.data.participantIds).toEqual(["a"]);
  });
  it("requires requester confirmation and rejects inactive counterparties at creation", async () => {
    const data = fixture();
    data.stored.delete("request");
    data.people.splice(1, 1);
    const request = {
      serviceId: "a-duty",
      serviceStart: first,
      serviceVersion: 1,
      partnerId: "b",
      confirmed: true,
    };
    await expect(createShiftSwap(user("a"), { ...request, confirmed: false })).rejects.toThrow();
    await expect(createShiftSwap(user("a"), request)).rejects.toThrow("aktiven Maskenteam");
    expect(data.stored.size).toBe(1);
  });
});
