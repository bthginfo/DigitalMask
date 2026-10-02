import { describe, it, expect } from "vitest";
import { occurrences } from "../src/modules/calendar/occurrences";
import { calendarPresentation } from "../src/shared/calendar-categories";
import { calendarEventPaint } from "../src/shared/calendar-paint";
import type { DomainRecord } from "../src/shared/contracts";
const event = (data: Record<string, unknown>) =>
  ({ id: "series", kind: "events", data }) as DomainRecord;
describe("calendar titles and colors", () => {
  const production: DomainRecord = {
    ...event({}),
    id: "gym",
    kind: "productions",
    data: { title: "Gym", color: "#aabbcc" },
  };
  const category: DomainRecord = {
    ...event({}),
    id: "ama",
    kind: "calendarCategories",
    data: { key: "ama", name: "AMA", color: "#123456", allDay: false },
  };
  it("uses production color and both labels, including legacy automatically assigned titles", () => {
    for (const title of ["", "Gym", "Gym – AMA"])
      expect(
        calendarPresentation(
          event({ title, productionId: "gym", category: "ama" }),
          [production],
          [category],
        ),
      ).toMatchObject({ title: "Gym – AMA", color: "#aabbcc", categoryName: "AMA" });
    expect(
      calendarPresentation(
        event({ title: "Generalprobe", productionId: "gym", category: "ama" }),
        [production],
        [category],
      ).title,
    ).toBe("Gym – AMA · Generalprobe");
  });
  it("uses the category without a production and keeps custom titles and missing-reference fallbacks", () => {
    expect(calendarPresentation(event({ category: "ama" }), [], [category])).toMatchObject({
      title: "AMA",
      color: "#123456",
      allDay: false,
    });
    expect(
      calendarPresentation(event({ category: "ama", title: "Werkstatt" }), [], [category]).title,
    ).toBe("Werkstatt");
    expect(
      calendarPresentation(event({ category: "ama", productionId: "removed" }), [], [category])
        .color,
    ).toBe("#123456");
    expect(calendarPresentation(event({ category: "vacation" }))).toMatchObject({
      title: "Urlaub",
      color: "#5c92a8",
      allDay: true,
    });
  });
  it("fades only all-day backgrounds and selects contrasting text for timed colors", () => {
    expect(calendarEventPaint("#123456", true)).toEqual({
      backgroundColor: "rgba(18, 52, 86, 0.5)",
      borderColor: "rgba(18, 52, 86, 0.5)",
      textColor: "var(--text)",
    });
    expect(calendarEventPaint("#123456", false)).toMatchObject({
      backgroundColor: "#123456",
      textColor: "#ffffff",
    });
    expect(calendarEventPaint("#aabbcc", false)).toMatchObject({
      backgroundColor: "#aabbcc",
      textColor: "#000000",
    });
    expect(calendarEventPaint("invalid", false).backgroundColor).toBe("#77818e");
  });
});
describe("theatre calendar recurrence", () => {
  it("preserves Berlin wall times across winter time, including overnight shifts", () => {
    const series = event({
      start: "2026-10-24T00:00:00+02:00",
      end: "2026-10-24T04:00:00+02:00",
      recurrence: "daily",
      exceptions: [],
    });
    const rows = occurrences(
      series,
      new Date("2026-10-25T00:00:00+02:00"),
      new Date("2026-10-26T00:00:00+01:00"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(rows[0].end.toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
  it("jumps directly to a visible range for old daily series", () => {
    const series = event({
      start: "2018-01-01T08:00:00+01:00",
      end: "2018-01-01T09:00:00+01:00",
      recurrence: "daily",
      exceptions: ["2026-09-30"],
    });
    const rows = occurrences(
      series,
      new Date("2026-09-29T00:00:00+02:00"),
      new Date("2026-10-01T00:00:00+02:00"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].start.toISOString()).toBe("2026-09-29T06:00:00.000Z");
  });
  it("honours an inclusive local last occurrence date", () => {
    const series = event({
      start: "2026-09-28T08:00:00+02:00",
      end: "2026-09-28T09:00:00+02:00",
      recurrence: "daily",
      until: "2026-09-29",
    });
    expect(
      occurrences(
        series,
        new Date("2026-09-28T00:00:00+02:00"),
        new Date("2026-10-01T00:00:00+02:00"),
      ),
    ).toHaveLength(2);
  });
});
