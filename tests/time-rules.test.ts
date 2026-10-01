import { describe, it, expect } from "vitest";
import {
  durationSeconds,
  intervalsOverlap,
  splitAcrossDays,
  bookingWeeks,
} from "../src/modules/time-tracking/rules";
describe("time booking", () => {
  it("calculates pauses without confusing decimal hours", () =>
    expect(durationSeconds("2026-09-30T10:15:00+02:00", "2026-09-30T12:15:00+02:00", 900)).toBe(
      6300,
    ));
  it("detects overlap and allows adjacent bookings", () => {
    expect(
      intervalsOverlap(
        "2026-09-30T08:00Z",
        "2026-09-30T10:00Z",
        "2026-09-30T09:59Z",
        "2026-09-30T11:00Z",
      ),
    ).toBe(true);
    expect(
      intervalsOverlap(
        "2026-09-30T08:00Z",
        "2026-09-30T10:00Z",
        "2026-09-30T10:00Z",
        "2026-09-30T11:00Z",
      ),
    ).toBe(false);
  });
  it("splits midnight in the theatre timezone", () =>
    expect(splitAcrossDays("2026-09-30T23:30:00+02:00", "2026-10-01T00:30:00+02:00")).toEqual([
      { date: "2026-09-30", seconds: 1800 },
      { date: "2026-10-01", seconds: 1800 },
    ]));
  it("uses actual duration through DST transition", () =>
    expect(durationSeconds("2026-10-25T01:00:00+02:00", "2026-10-25T04:00:00+01:00")).toBe(14400));
  it("rejects backwards intervals", () =>
    expect(() => durationSeconds("2026-09-30T10:00Z", "2026-09-30T09:00Z")).toThrow());
  it("finds both weeks of a booking across Sunday midnight", () => {
    expect(
      bookingWeeks({
        dayAllocations: splitAcrossDays("2026-10-04T23:30:00+02:00", "2026-10-05T00:30:00+02:00"),
      }),
    ).toEqual(["2026-09-28", "2026-10-05"]);
    expect(bookingWeeks({ date: "2026-10-01" })).toEqual(["2026-09-28"]);
    expect(bookingWeeks()).toEqual([]);
  });
});
