import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { groupBookingWeeks, isoWeek, periodForWeek } from "../src/modules/time-tracking/history";
import { splitAcrossDays } from "../src/modules/time-tracking/rules";

const record = (id: string, data: Record<string, unknown>, kind: "attendance" | "time" = "time") =>
  ({
    id,
    kind,
    data: { userId: "mara", ...data },
    organizationId: "fictional",
    departmentId: "mask",
    createdBy: "mara",
    createdAt: "2026-10-04T08:00Z",
    updatedAt: "2026-10-04T08:00Z",
    version: 1,
  }) as DomainRecord;

describe("cached editable weekly history", () => {
  it("uses the ISO week-year and sorts newest first independently of the selected week", () => {
    const weeks = groupBookingWeeks(
      [
        record("new-year", { date: "2027-01-01", durationSeconds: 3600 }),
        record("previous", { date: "2026-09-23", durationSeconds: 7200 }),
        record("next", { date: "2027-01-04", durationSeconds: 1800 }),
      ],
      { userId: "mara" },
    );
    expect(weeks.map(({ number, year, seconds }) => [number, year, seconds])).toEqual([
      [1, 2027, 1800],
      [53, 2026, 3600],
      [39, 2026, 7200],
    ]);
    expect(isoWeek("2025-12-31")).toMatchObject({ number: 1, year: 2026 });
  });
  it("clips split bookings to both week and period without counting the full booking twice", () => {
    const split = splitAcrossDays("2026-12-31T23:00+01:00", "2027-01-01T02:00+01:00", 1800);
    const weeks = groupBookingWeeks(
      [record("overnight", { dayAllocations: split, durationSeconds: 9000 })],
      { userId: "mara", period: { year: 2027 } },
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].seconds).toBe(6000);
    expect(weeks[0].entries[0].allocations).toEqual([{ date: "2027-01-01", seconds: 6000 }]);
    const sunday = record("sunday", {
      dayAllocations: splitAcrossDays("2026-10-04T23:30+02:00", "2026-10-05T00:30+02:00"),
    });
    const both = groupBookingWeeks([sunday], { userId: "mara" });
    expect(both.map((week) => week.seconds)).toEqual([1800, 1800]);
    expect(both.reduce((total, week) => total + week.seconds, 0)).toBe(3600);
  });
  it("honours owner, production and season while keeping earlier attendance editable", () => {
    const records = [
      record("old", { date: "2026-07-31", durationSeconds: 5400, productionId: "p" }),
      record("current", { date: "2026-08-01", durationSeconds: 7200, productionId: "p" }),
      record("other-person", { date: "2026-08-01", durationSeconds: 100, userId: "nora" }),
      record("other-project", { date: "2026-08-01", durationSeconds: 100, productionId: "q" }),
    ];
    expect(
      groupBookingWeeks(records, {
        userId: "mara",
        productionId: "p",
        period: { season: "2026/2027" },
      })[0].seconds,
    ).toBe(7200);
    const attendance = record(
      "attendance-old",
      { date: "2026-05-04", durationSeconds: 3600 },
      "attendance",
    );
    expect(groupBookingWeeks([attendance], { userId: "mara" })[0].entries[0].record).toBe(
      attendance,
    );
  });
  it("aligns active filters to a week and clears boundary filters that would hide its days", () => {
    expect(periodForWeek({ season: "2026/2027", year: 2026 }, "2025-11-10")).toEqual({
      season: "2025/2026",
      year: 2025,
    });
    expect(periodForWeek({ season: "2026/2027", year: 2026 }, "2026-12-28")).toEqual({
      season: "2026/2027",
    });
    expect(periodForWeek({ season: "2026/2027" }, "2026-07-27")).toEqual({});
  });
});
