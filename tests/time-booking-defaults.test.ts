import { describe, expect, it } from "vitest";
import { initialBookingTimes } from "../src/modules/time-tracking/booking-defaults";

describe("initial times of the booking editor", () => {
  it("uses the date and times of a past calendar event", () => {
    expect(
      initialBookingTimes(
        { date: "2026-10-02", start: "2026-10-02T17:30:00.000Z", end: "2026-10-02T21:00:00.000Z" },
        "2026-11-26",
      ),
    ).toEqual({ date: "2026-10-02", start: "2026-10-02T19:30", end: "2026-10-02T23:00" });
    expect(
      initialBookingTimes({ start: "2026-10-02T19:30", end: "2026-10-03T00:30" }, "2026-11-26"),
    ).toEqual({ date: "2026-10-02", start: "2026-10-02T19:30", end: "2026-10-03T00:30" });
  });

  it("falls back to the chosen day, or today, from 9 to 17", () => {
    expect(initialBookingTimes({ date: "2026-10-05" }, "2026-11-26")).toEqual({
      date: "2026-10-05",
      start: "2026-10-05T09:00",
      end: "2026-10-05T17:00",
    });
    expect(initialBookingTimes({}, "2026-11-26").date).toBe("2026-11-26");
    expect(initialBookingTimes({ start: "2026-10-02T19:30" }, "2026-11-26").end).toBe(
      "2026-10-02T20:30",
    );
  });
});
