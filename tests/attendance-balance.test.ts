import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { visibleWorkingTime, type WorkingTimeSettings } from "../src/shared/working-time";
import { calculateAttendanceBalance, signedHours } from "../src/modules/time-tracking/balance";
import { startOfLocalDay } from "../src/modules/time-tracking/rules";
import { shiftDate } from "../src/shared/client-api";
import { profileUpdateSchema } from "../src/modules/profile/schema";

const settings: WorkingTimeSettings = {
  version: 1,
  openingBalanceSeconds: 7200,
  schedules: [
    { effectiveFrom: "2026-10-05", weeklyMinutes: 42 * 60, workingDays: [1, 2, 3, 4, 5, 6] },
  ],
};
const record = (
  id: string,
  kind: DomainRecord["kind"],
  data: Record<string, unknown>,
): DomainRecord => ({
  id,
  kind,
  organizationId: "fictional",
  departmentId: "mask",
  createdBy: "mara",
  createdAt: "2026-10-05T08:00:00Z",
  updatedAt: "2026-10-05T08:00:00Z",
  version: 1,
  data: { userId: "mara", ...data },
});
const attendance = (id: string, date: string, hours: number) =>
  record(id, "attendance", { date, durationSeconds: hours * 3600 });
const absence = (id: string, date: string, category: string, extra = {}) =>
  record(id, "events", {
    start: startOfLocalDay(date).toISOString(),
    end: startOfLocalDay(shiftDate(date, 1)).toISOString(),
    allDay: true,
    participantIds: ["mara"],
    category,
    ...extra,
  });
const calculate = (input: Partial<Parameters<typeof calculateAttendanceBalance>[0]> = {}) =>
  calculateAttendanceBalance({
    userId: "mara",
    settings,
    attendance: [],
    now: new Date("2026-10-07T12:00:00+02:00"),
    ...input,
  });

describe("saved attendance balance and dated weekly targets", () => {
  it("uses six target days, stops at today and keeps production work separate", () => {
    const result = calculate({
      attendance: [
        attendance("mon", "2026-10-05", 8),
        attendance("future", "2026-10-08", 20),
        record("production", "time", { date: "2026-10-06", durationSeconds: 99 * 3600 }),
        record("other", "attendance", {
          userId: "nora",
          date: "2026-10-06",
          durationSeconds: 20 * 3600,
        }),
      ],
    });
    expect(result.targetSeconds).toBe(21 * 3600);
    expect(result).toMatchObject({
      attendanceSeconds: 8 * 3600,
      targetSeconds: 21 * 3600,
      openingBalanceSeconds: 2 * 3600,
      balanceSeconds: -11 * 3600,
      to: "2026-10-07",
    });
  });
  it("caps paid absence to missing daily target and never credits the same day twice", () => {
    const result = calculate({
      attendance: [
        attendance("mon", "2026-10-05", 8),
        attendance("tue", "2026-10-06", 6),
        attendance("wed", "2026-10-07", 2),
      ],
      events: [
        absence("vacation", "2026-10-06", "vacation"),
        absence("vacation-duplicate", "2026-10-06", "vacation"),
        absence("sick", "2026-10-07", "sick"),
      ],
    });
    expect(result).toMatchObject({
      attendanceSeconds: 16 * 3600,
      creditSeconds: 6 * 3600,
      targetSeconds: 21 * 3600,
      balanceSeconds: 3 * 3600,
    });
  });
  it("does not credit ABF, rest, half-free days, holidays or non-target Sundays", () => {
    const result = calculate({
      events: [
        absence("abf", "2026-10-05", "abf"),
        absence("rest", "2026-10-06", "rest"),
        absence("half", "2026-10-07", "half-day-off"),
        absence("holiday", "2026-10-07", "holiday"),
        absence("sun", "2026-10-11", "vacation"),
      ],
      now: new Date("2026-10-11T23:00:00+02:00"),
    });
    expect(result.creditSeconds).toBe(0);
    expect(result.targetSeconds).toBe(42 * 3600);
  });
  it("requires approval for calendar absences linked to a leave request", () => {
    const events = [
      absence("approved", "2026-10-05", "vacation", { leaveId: "yes" }),
      absence("pending", "2026-10-06", "vacation", { leaveId: "pending" }),
      absence("missing", "2026-10-07", "sick", { leaveId: "missing" }),
    ];
    const result = calculate({
      events,
      leave: [
        record("yes", "leave", { status: "approved" }),
        record("pending", "leave", { status: "pending" }),
      ],
    });
    expect(result.creditSeconds).toBe(7 * 3600);
  });
  it("preserves older targets after a dated change and excludes opening balance from period views", () => {
    const changed = {
      ...settings,
      schedules: [
        ...settings.schedules,
        { effectiveFrom: "2026-10-12", weeklyMinutes: 36 * 60, workingDays: [1, 2, 3, 4, 5, 6] },
      ],
    };
    const result = calculate({ settings: changed, now: new Date("2026-10-13T20:00:00+02:00") });
    expect(result.targetSeconds).toBe(54 * 3600);
    expect(
      calculate({
        settings: changed,
        from: "2026-10-12",
        to: "2026-10-18",
        now: new Date("2026-10-13T20:00:00+02:00"),
      }),
    ).toMatchObject({
      targetSeconds: 12 * 3600,
      openingBalanceSeconds: 0,
      balanceSeconds: -12 * 3600,
    });
  });
  it("clips future parts of saved intervals, preserves pauses and avoids pre-contract deficits", () => {
    const result = calculate({
      from: "2026-10-07",
      attendance: [
        record("not-yet-finished", "attendance", {
          start: "2026-10-07T09:00:00+02:00",
          end: "2026-10-07T17:00:00+02:00",
          date: "2026-10-07",
          pauseSeconds: 1800,
          durationSeconds: 7.5 * 3600,
        }),
      ],
    });
    expect(result).toMatchObject({
      attendanceSeconds: 2.5 * 3600,
      targetSeconds: 7 * 3600,
      openingBalanceSeconds: 0,
    });
    expect(
      calculate({
        settings: {
          ...settings,
          schedules: [{ ...settings.schedules[0], effectiveFrom: "2026-11-02" }],
        },
      }),
    ).toMatchObject({ targetSeconds: 0, openingBalanceSeconds: 0, balanceSeconds: 0 });
    expect(signedHours(9000)).toBe("+2,5");
    expect(signedHours(-3600)).toBe("−1");
  });
  it("keeps colleague targets private for ordinary users and validates explicit update inputs", () => {
    expect(visibleWorkingTime(settings, "mara", "nora", "user")).toBeUndefined();
    expect(visibleWorkingTime(settings, "mara", "mara", "user")).toBe(settings);
    expect(visibleWorkingTime(settings, "mara", "nora", "admin")).toBe(settings);
    const update = {
      effectiveFrom: "2026-10-05",
      weeklyMinutes: 2400,
      workingDays: [1, 2, 3, 4, 5, 6],
      openingBalanceSeconds: 0,
      expectedVersion: 0,
    };
    expect(profileUpdateSchema.safeParse({ memberId: "mara", workingTime: update }).success).toBe(
      true,
    );
    for (const input of [
      { ...update, workingDays: [] },
      { ...update, workingDays: [1, 1] },
      { ...update, effectiveFrom: "2026-02-31" },
      { ...update, weeklyMinutes: -1 },
    ])
      expect(profileUpdateSchema.safeParse({ workingTime: input }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ memberId: "nora", accentPalette: "sky" }).success).toBe(
      false,
    );
  });
});
