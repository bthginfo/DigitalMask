import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { timeDayMarkers } from "../src/modules/time-tracking/day-markers";
import { groupBookingWeeks } from "../src/modules/time-tracking/history";

const event = (id: string, data: Record<string, unknown>): DomainRecord => ({
  id,
  kind: "events",
  organizationId: "fictional",
  departmentId: "mask",
  createdBy: "mara",
  createdAt: "2026-10-04T08:00Z",
  updatedAt: "2026-10-04T08:00Z",
  version: 1,
  data: { participantIds: ["mara"], ...data },
});
describe("calendar day markers in time history", () => {
  it("expands exclusive Berlin dates and keeps label-only weeks without invented hours", () => {
    const markers = timeDayMarkers({
      events: [
        event("abf", {
          category: "abf",
          allDay: true,
          start: "2026-09-21T00:00+02:00",
          end: "2026-09-22T00:00+02:00",
        }),
        event("rest", {
          category: "rest",
          allDay: true,
          start: "2026-09-26T00:00+02:00",
          end: "2026-09-27T00:00+02:00",
        }),
        event("work", {
          category: "service",
          start: "2026-09-22T09:00+02:00",
          end: "2026-09-22T13:00+02:00",
        }),
      ],
      userId: "mara",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(markers.map(({ date, label }) => [date, label])).toEqual([
      ["2026-09-21", "ABF"],
      ["2026-09-26", "Ruhetag"],
    ]);
    expect(groupBookingWeeks([], { userId: "mara", markers })[0]).toMatchObject({
      number: 39,
      year: 2026,
      seconds: 0,
      entries: [],
    });
  });
  it("respects recurrence exceptions, selected owner and season/year clipping", () => {
    const markers = timeDayMarkers({
      events: [
        event("series", {
          category: "vacation",
          allDay: true,
          start: "2026-07-31T00:00+02:00",
          end: "2026-08-01T00:00+02:00",
          recurrence: "daily",
          until: "2026-08-03",
          exceptions: ["2026-08-02"],
        }),
        event("nora", {
          category: "rest",
          allDay: true,
          start: "2026-08-01T00:00+02:00",
          end: "2026-08-02T00:00+02:00",
          participantIds: ["nora"],
        }),
      ],
      userId: "mara",
      from: "2026-07-30",
      to: "2026-08-04",
      period: { season: "2026/2027", year: 2026 },
    });
    expect(markers.map((marker) => marker.date)).toEqual(["2026-08-01", "2026-08-03"]);
  });
});
