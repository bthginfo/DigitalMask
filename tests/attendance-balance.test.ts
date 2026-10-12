import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { visibleWorkingTime, type WorkingTimeSettings } from "../src/shared/working-time";
import { calculateAttendanceBalance, signedHours } from "../src/modules/time-tracking/balance";
import { startOfLocalDay } from "../src/modules/time-tracking/rules";
import { shiftDate } from "../src/shared/client-api";
import { profileUpdateSchema } from "../src/modules/profile/schema";
import { calendarCategoryCreditsTime } from "../src/shared/calendar-categories";

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
  it("adds paid days to saved attendance and never credits the same day twice", () => {
    const result = calculate({
      attendance: [
        attendance("mon", "2026-10-05", 8),
        attendance("tue", "2026-10-06", 6),
        attendance("wed", "2026-10-07", 2),
      ],
      events: [
        absence("vacation", "2026-10-06", "vacation"),
        absence("holiday-overlap", "2026-10-06", "holiday"),
        absence("sick", "2026-10-07", "sick"),
      ],
    });
    expect(result).toMatchObject({
      attendanceSeconds: 16 * 3600,
      creditSeconds: 14 * 3600,
      targetSeconds: 21 * 3600,
      balanceSeconds: 11 * 3600,
    });
  });
  it("does not credit ABF, rest, half-free days or non-target Sundays", () => {
    const result = calculate({
      events: [
        absence("abf", "2026-10-05", "abf"),
        absence("rest", "2026-10-06", "rest"),
        absence("half", "2026-10-07", "half-day-off"),
        absence("sun", "2026-10-11", "vacation"),
      ],
      now: new Date("2026-10-11T23:00:00+02:00"),
    });
    expect(result.creditSeconds).toBe(0);
    expect(result.targetSeconds).toBe(42 * 3600);
  });
  it.each([
    "Urlaub",
    "Krank",
    "Krank mit Attest",
    "Krank ohne Attest",
    "Krank (mit/ohne Attest)",
    "Feiertag",
    "Feiertagsausgleich",
  ])("credits the existing custom calendar category %s without rewriting its key", (name) => {
    const category = record("custom-type", "calendarCategories", {
      key: "category-existing-uuid",
      name,
      allDay: true,
    });
    const result = calculate({
      calendarCategories: [category],
      events: [absence("marked-day", "2026-10-05", String(category.data.key))],
    });
    expect(result.creditSeconds).toBe(7 * 3600);
    expect(category.data.key).toBe("category-existing-uuid");
  });
  it.each(["ABF", "Ruhetag", "HFT", "Halber freier Tag", "Feiertagsprobe", "Sonstiges"])(
    "keeps the custom calendar category %s without a time credit",
    (name) => {
      const result = calculate({
        calendarCategories: [
          record("unpaid-type", "calendarCategories", { key: "custom-unpaid", name, allDay: true }),
        ],
        events: [absence("marked-day", "2026-10-05", "custom-unpaid")],
      });
      expect(result.creditSeconds).toBe(0);
    },
  );
  it("uses contractual hours divided by six and credits only personal all-day calendar entries", () => {
    const result = calculate({
      settings: {
        ...settings,
        openingBalanceSeconds: 0,
        schedules: [
          { effectiveFrom: "2026-10-05", weeklyMinutes: 40 * 60, workingDays: [1, 2, 3, 4, 5] },
        ],
      },
      attendance: [attendance("actual-hours", "2026-10-05", 15)],
      calendarCategories: [
        record("timed-type", "calendarCategories", {
          key: "timed-sick",
          name: "Krank ohne Attest",
          allDay: false,
        }),
      ],
      events: [
        absence("holiday", "2026-10-05", "holiday"),
        absence("other-person", "2026-10-06", "sick", { participantIds: ["nora"] }),
        absence("unassigned", "2026-10-06", "vacation", { participantIds: [] }),
        absence("timed", "2026-10-06", "timed-sick", { allDay: false }),
        absence("future", "2026-10-08", "vacation"),
      ],
    });
    expect(result.attendanceSeconds).toBe(15 * 3600);
    expect(result.creditSeconds).toBe(24000);
    expect(result.attendanceSeconds + result.creditSeconds).toBe(21 * 3600 + 40 * 60);
  });
  it("uses the weekly hours applicable on each date, including recurring and multi-day entries", () => {
    const result = calculate({
      settings: {
        ...settings,
        schedules: [
          ...settings.schedules,
          { effectiveFrom: "2026-10-12", weeklyMinutes: 36 * 60, workingDays: [1, 2, 3, 4, 5, 6] },
        ],
      },
      now: new Date("2026-10-13T20:00:00+02:00"),
      events: [
        absence("recurring-holiday-compensation", "2026-10-05", "holiday-compensation", {
          recurrence: "weekly",
        }),
        absence("multi-day-vacation", "2026-10-09", "vacation", {
          end: startOfLocalDay("2026-10-12").toISOString(),
        }),
      ],
    });
    // Oct 5/9/10 use 42÷6; Oct 11 is not a target day; Oct 12 uses 36÷6.
    expect(result.creditSeconds).toBe((7 * 3 + 6) * 3600);
  });
  it("keeps Bavarian holiday date labels separate from personal time credits", () => {
    const result = calculate({
      settings: {
        ...settings,
        schedules: [{ ...settings.schedules[0], effectiveFrom: "2026-10-01" }],
      },
      now: new Date("2026-10-03T20:00:00+02:00"),
    });
    expect(result.targetSeconds).toBe(21 * 3600);
    expect(result.creditSeconds).toBe(0);
  });
  it("recognizes category keys and names but keeps explicit unpaid categories unpaid", () => {
    for (const key of [
      "vacation",
      "sick",
      "sick-with-certificate",
      "sick-without-certificate",
      "holiday",
      "holiday-compensation",
    ])
      expect(calendarCategoryCreditsTime(key)).toBe(true);
    expect(calendarCategoryCreditsTime("rest", { name: "Feiertag" })).toBe(false);
    expect(calendarCategoryCreditsTime("custom", { name: " KRANK (ohne Attest) " })).toBe(true);
    expect(calendarCategoryCreditsTime("custom", { name: "Feiertags-Probe" })).toBe(false);
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
  it("counts saved attendance today in full, preserves pauses and avoids pre-contract deficits", () => {
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
      attendanceSeconds: 7.5 * 3600,
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
  it("counts saved bookings starting later today but excludes future dates", () => {
    const result = calculate({
      from: "2026-10-07",
      attendance: [
        record("evening-today", "attendance", {
          start: "2026-10-07T18:00:00+02:00",
          end: "2026-10-07T22:00:00+02:00",
          date: "2026-10-07",
          durationSeconds: 4 * 3600,
        }),
        attendance("tomorrow", "2026-10-08", 9),
      ],
    });
    expect(result.attendanceSeconds).toBe(4 * 3600);
    expect(result.targetSeconds).toBe(7 * 3600);
  });
  it("counts today's complete overnight allocation without including tomorrow's hours", () => {
    const booking = record("overnight", "attendance", {
      start: "2026-10-07T22:00:00+02:00",
      end: "2026-10-08T02:00:00+02:00",
      date: "2026-10-07",
      pauseSeconds: 1800,
      durationSeconds: 3.5 * 3600,
      dayAllocations: [
        { date: "2026-10-07", seconds: 1.75 * 3600 },
        { date: "2026-10-08", seconds: 1.75 * 3600 },
      ],
    });
    expect(calculate({ from: "2026-10-07", attendance: [booking] }).attendanceSeconds).toBe(
      1.75 * 3600,
    );
    expect(
      calculate({
        from: "2026-10-07",
        attendance: [booking],
        now: new Date("2026-10-08T01:00:00+02:00"),
      }).attendanceSeconds,
    ).toBe(3.5 * 3600);
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
