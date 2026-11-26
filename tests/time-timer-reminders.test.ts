import { beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceTimers, memberships, records, timers } from "@/platform/db/schema";
import type { RecordData } from "@/shared/contracts";

const mock = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  devices: vi.fn(),
  send: vi.fn(),
  rows: new Map<unknown, unknown[]>(),
  updates: [] as { table: unknown; set: unknown }[],
  claimed: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/modules/notifications/service", () => ({
  pushConfigured: mock.configured,
  departmentDevices: mock.devices,
  send: mock.send,
}));
vi.mock("@/platform/db", () => {
  const result = (rows: unknown[]) => ({
    groupBy: async () => rows,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  });
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({ where: () => result(mock.rows.get(table) || []) }),
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => ({
          where: () => {
            mock.updates.push({ table, set });
            const run = async () => mock.claimed(table) as { id: string }[];
            return {
              returning: run,
              then: (resolve: (value: unknown) => unknown) => run().then(resolve),
            };
          },
        }),
      }),
    },
  };
});
import {
  selectTimerReminders,
  timerLongRunning,
  timerReminderDue,
  timerReminderText,
  type OpenTimer,
} from "@/modules/time-tracking/timer-reminder-rules";
import { remindLongRunningTimers } from "@/modules/time-tracking/timer-reminders";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();
const open = (
  id: string,
  kind: OpenTimer["kind"],
  userId: string,
  data: RecordData,
): OpenTimer => ({ id, kind, userId, departmentId: "makeup", data });

describe("reminders for forgotten timers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.rows.clear();
    mock.updates.length = 0;
    mock.configured.mockReturnValue(true);
    mock.send.mockResolvedValue(true);
    mock.claimed.mockImplementation((table) =>
      (mock.rows.get(table) || []).map((row) => ({ id: (row as OpenTimer).id })),
    );
  });

  it("selects timers open longer than 11 hours and not reminded in the last 12 hours", () => {
    expect(timerLongRunning({ startedAt: ago(10) }, NOW)).toBe(false);
    expect(timerLongRunning({ startedAt: ago(11.01) }, NOW)).toBe(true);
    // A paused but still open timer counts: it was probably forgotten as well.
    expect(timerLongRunning({ startedAt: ago(12), pausedAt: ago(8) }, NOW)).toBe(true);
    expect(timerLongRunning({ startedAt: ago(12), stopping: true }, NOW)).toBe(false);
    expect(timerReminderDue({ startedAt: ago(20), remindedAt: ago(6) }, NOW)).toBe(false);
    expect(timerReminderDue({ startedAt: ago(30), remindedAt: ago(12) }, NOW)).toBe(true);
    expect(timerReminderDue({ startedAt: ago(30), remindedAt: "kaputt" }, NOW)).toBe(true);
  });

  it("groups one reminder per person and skips the person who is using the app", () => {
    const people = selectTimerReminders(
      [
        open("a1", "attendance", "anna", { startedAt: ago(14) }),
        open("t1", "time", "anna", { startedAt: ago(12) }),
        open("a2", "attendance", "ben", { startedAt: ago(13), remindedAt: ago(1) }),
        open("a3", "attendance", "clara", { startedAt: ago(15) }),
        open("t3", "time", "dana", { startedAt: ago(2) }),
      ],
      NOW,
      "clara",
    );
    expect(people).toEqual([
      expect.objectContaining({ userId: "anna", timers: [expect.anything(), expect.anything()] }),
    ]);
    expect(timerReminderText(["attendance", "time"]).body).toBe(
      "Anwesenheit und Produktionszeit laufen seit über 11 Stunden. Vergessen zu stoppen?",
    );
    expect(timerReminderText(["time"]).body).toContain("Deine Produktionszeit läuft");
  });

  it("claims the timers and sends one push per active person with a device", async () => {
    mock.rows.set(attendanceTimers, [
      open("a1", "attendance", "anna", { startedAt: ago(14) }),
      open("a2", "attendance", "emil", { startedAt: ago(14) }),
      open("a3", "attendance", "former", { startedAt: ago(14) }),
    ]);
    mock.rows.set(timers, [open("t1", "time", "anna", { startedAt: ago(12) })]);
    mock.rows.set(memberships, [
      { userId: "anna", departmentId: "makeup" },
      { userId: "emil", departmentId: "makeup" },
    ]);
    mock.rows.set(records, [{ userId: "anna", departmentId: "makeup", count: 3 }]);
    mock.devices.mockResolvedValue([
      { id: "phone", userId: "anna", departmentId: "makeup" },
      { id: "tablet", userId: "anna", departmentId: "makeup" },
    ]);
    const result = await remindLongRunningTimers({ now: new Date(NOW) });
    expect(result).toEqual({ reminded: 1, failed: 0 });
    expect(mock.send).toHaveBeenCalledTimes(2);
    expect(mock.send.mock.calls[0][1]).toMatchObject({
      title: "DigitalMask · Timer läuft noch",
      url: "/?module=time",
      tag: "timer-reminder:anna",
      userId: "anna",
      unreadCount: 3,
    });
    expect(mock.updates.map((update) => update.table)).toEqual([attendanceTimers, timers]);
  });

  it("releases the claim when no device received the reminder", async () => {
    mock.rows.set(attendanceTimers, [open("a1", "attendance", "anna", { startedAt: ago(14) })]);
    mock.rows.set(memberships, [{ userId: "anna", departmentId: "makeup" }]);
    mock.devices.mockResolvedValue([{ id: "phone", userId: "anna", departmentId: "makeup" }]);
    mock.send.mockRejectedValue(new Error("offline"));
    expect(await remindLongRunningTimers({ now: new Date(NOW) })).toEqual({
      reminded: 0,
      failed: 1,
    });
    // Claim, then release.
    expect(mock.updates).toHaveLength(2);
  });

  it("does nothing without configured push", async () => {
    mock.configured.mockReturnValue(false);
    mock.rows.set(attendanceTimers, [open("a1", "attendance", "anna", { startedAt: ago(14) })]);
    expect(await remindLongRunningTimers({ now: new Date(NOW) })).toEqual({
      reminded: 0,
      failed: 0,
    });
    expect(mock.devices).not.toHaveBeenCalled();
  });
});
