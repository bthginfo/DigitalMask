import { describe, it, expect } from "vitest";
import { occurrences } from "../src/modules/calendar/occurrences";
import type { DomainRecord } from "../src/shared/contracts";
const event = (data: Record<string, unknown>) =>
  ({ id: "series", kind: "events", data }) as DomainRecord;
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
