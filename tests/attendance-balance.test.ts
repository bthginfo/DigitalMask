import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { visibleWorkingTime, type WorkingTimeSettings } from "../src/shared/working-time";
import {
  attendanceMonthRange,
  calculateAttendanceBalance,
  signedHours,
} from "../src/modules/time-tracking/balance";
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
  it("uses the full weekly quota, counts attendance through today and keeps production work separate", () => {
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
    expect(result.targetSeconds).toBe(42 * 3600);
    expect(result).toMatchObject({
      attendanceSeconds: 8 * 3600,
      targetSeconds: 42 * 3600,
      openingBalanceSeconds: 2 * 3600,
      balanceSeconds: -32 * 3600,
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
      targetSeconds: 42 * 3600,
      balanceSeconds: -10 * 3600,
    });
  });
  it("does not credit ABF, rest or half-free days but credits a personally marked Sunday", () => {
    const result = calculate({
      events: [
        absence("abf", "2026-10-05", "abf"),
        absence("rest", "2026-10-06", "rest"),
        absence("half", "2026-10-07", "half-day-off"),
        absence("sun", "2026-10-11", "vacation"),
      ],
      now: new Date("2026-10-11T23:00:00+02:00"),
    });
    expect(result.creditSeconds).toBe(7 * 3600);
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
    // Oct 5/9/10/11 use 42÷6, independently of weekdays; Oct 12 uses 36÷6.
    expect(result.creditSeconds).toBe((7 * 4 + 6) * 3600);
  });
  it("keeps Bavarian holiday date labels separate from personal time credits", () => {
    const result = calculate({
      settings: {
        ...settings,
        schedules: [{ ...settings.schedules[0], effectiveFrom: "2026-10-01" }],
      },
      now: new Date("2026-10-03T20:00:00+02:00"),
    });
    expect(result.targetSeconds).toBe(24 * 3600);
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
    expect(result.targetSeconds).toBe(78 * 3600);
    expect(
      calculate({
        settings: changed,
        from: "2026-10-12",
        to: "2026-10-18",
        now: new Date("2026-10-13T20:00:00+02:00"),
      }),
    ).toMatchObject({
      targetSeconds: 36 * 3600,
      openingBalanceSeconds: 0,
      balanceSeconds: -36 * 3600,
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
      targetSeconds: 42 * 3600,
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
    expect(result.targetSeconds).toBe(42 * 3600);
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

  it("does not apply a retained opening balance while no weekly contract is configured", () => {
    const result = calculate({ settings: { ...settings, schedules: [] } });
    expect(result).toMatchObject({
      openingBalanceSeconds: 0,
      balanceSeconds: 0,
      weeks: [],
      completed: { openingBalanceSeconds: 0, balanceSeconds: 0 },
    });
  });

  it.each([15, 20, 39])(
    "allows freely distributed work and computes overtime against %i hours",
    (weeklyHours) => {
      const result = calculate({
        settings: {
          ...settings,
          openingBalanceSeconds: 0,
          schedules: [{ ...settings.schedules[0], weeklyMinutes: weeklyHours * 60 }],
        },
        attendance: [
          attendance("mon", "2026-10-05", weeklyHours * 0.4),
          attendance("thu", "2026-10-08", weeklyHours * 0.35),
          attendance("sun", "2026-10-11", weeklyHours * 0.25 + 7.75),
        ],
        now: new Date("2026-10-11T12:00:00+02:00"),
      });
      expect(result.targetSeconds).toBe(weeklyHours * 3600);
      expect(result.balanceSeconds).toBe(7.75 * 3600);
      expect(result.completed.balanceSeconds).toBe(7.75 * 3600);
    },
  );

  it.each([
    [15, 2.5],
    [10, -2.5],
  ])("matches Lena's example: %i worked hours plus one holiday gives %f", (worked, balance) => {
    const result = calculate({
      settings: {
        ...settings,
        openingBalanceSeconds: 0,
        schedules: [{ ...settings.schedules[0], weeklyMinutes: 900 }],
      },
      attendance: [attendance("worked", "2026-10-05", worked)],
      events: [absence("holiday", "2026-10-06", "holiday")],
      now: new Date("2026-10-11T12:00:00+02:00"),
    });
    expect(result.creditSeconds).toBe(2.5 * 3600);
    expect(result.completed.balanceSeconds).toBe(balance * 3600);
  });

  it.each([15, 20, 39])(
    "adds exactly a sixth of %i weekly hours for a personally marked holiday",
    (weeklyHours) => {
      const result = calculate({
        settings: {
          ...settings,
          openingBalanceSeconds: 0,
          schedules: [{ ...settings.schedules[0], weeklyMinutes: weeklyHours * 60 }],
        },
        attendance: [
          attendance("worked-mon", "2026-10-05", weeklyHours / 2),
          attendance("worked-fri", "2026-10-09", weeklyHours / 2),
        ],
        events: [absence("holiday", "2026-10-09", "holiday")],
        now: new Date("2026-10-11T12:00:00+02:00"),
      });
      expect(result.completed.balanceSeconds).toBe((weeklyHours * 3600) / 6);
    },
  );

  it("keeps the weekly quota constant during the week and separates the unfinished week", () => {
    const input = {
      settings: {
        ...settings,
        openingBalanceSeconds: 0,
        schedules: [{ ...settings.schedules[0], weeklyMinutes: 900 }],
      },
      attendance: [attendance("done", "2026-10-05", 15)],
    };
    for (const day of ["2026-10-05", "2026-10-07", "2026-10-11"]) {
      const result = calculate({ ...input, now: new Date(`${day}T12:00:00+02:00`) });
      expect(result.targetSeconds).toBe(15 * 3600);
      expect(result.balanceSeconds).toBe(0);
      expect(result.weeks[0].completed).toBe(day === "2026-10-11");
    }
  });

  it("sums completed weeks with the start balance and keeps today's full saved hours in the open week", () => {
    const result = calculate({
      settings: {
        ...settings,
        openingBalanceSeconds: 2 * 3600,
        schedules: [{ ...settings.schedules[0], weeklyMinutes: 900 }],
      },
      attendance: [
        attendance("last-week", "2026-10-05", 19),
        attendance("today", "2026-10-12", 6.5),
      ],
      now: new Date("2026-10-12T12:00:00+02:00"),
    });
    expect(result.completed).toMatchObject({
      attendanceSeconds: 19 * 3600,
      targetSeconds: 15 * 3600,
      balanceSeconds: 6 * 3600,
    });
    expect(result.weeks[1]).toMatchObject({
      completed: false,
      attendanceSeconds: 6.5 * 3600,
      targetSeconds: 15 * 3600,
      balanceSeconds: -8.5 * 3600,
    });
    expect(result.balanceSeconds).toBe(-2.5 * 3600);
    const retroactive = calculate({
      ...{
        settings: { ...settings, schedules: [{ ...settings.schedules[0], weeklyMinutes: 900 }] },
        now: new Date("2026-10-12T12:00:00+02:00"),
      },
      attendance: [
        attendance("last-week", "2026-10-05", 20),
        attendance("today", "2026-10-12", 6.5),
      ],
    });
    expect(retroactive.completed.balanceSeconds).toBe(7 * 3600);
  });

  it("assigns whole weeks to their Monday's month without overlapping neighboring months", () => {
    expect(attendanceMonthRange("2026-10")).toEqual({ from: "2026-10-05", to: "2026-11-01" });
    const november = attendanceMonthRange("2026-11");
    expect(november).toEqual({ from: "2026-11-02", to: "2026-12-06" });
    expect(attendanceMonthRange("2026-12").from).toBe(shiftDate(november.to, 1));
    expect(attendanceMonthRange("2026-12").to).toBe("2027-01-03");
  });

  it("expands custom dates to whole weeks instead of assigning a daily quota", () => {
    const result = calculate({
      from: "2026-10-07",
      to: "2026-10-07",
      attendance: [attendance("monday", "2026-10-05", 8)],
      now: new Date("2026-10-12T12:00:00+02:00"),
    });
    expect(result).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-11",
      attendanceSeconds: 8 * 3600,
      targetSeconds: 42 * 3600,
      openingBalanceSeconds: 0,
    });
    expect(result.weeks[0].completed).toBe(true);
  });

  it("only prorates an account start or dated contract change inside a week, never elapsed time", () => {
    const result = calculate({
      settings: {
        ...settings,
        schedules: [
          { ...settings.schedules[0], effectiveFrom: "2026-10-07" },
          { ...settings.schedules[0], effectiveFrom: "2026-10-15", weeklyMinutes: 35 * 60 },
        ],
      },
      now: new Date("2026-10-12T12:00:00+02:00"),
    });
    expect(result.weeks.map((row) => row.targetSeconds)).toEqual([30 * 3600, 38 * 3600]);
    expect(result.targetSeconds).toBe(68 * 3600);
  });
});
