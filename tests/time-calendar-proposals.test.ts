import { describe, expect, it } from "vitest";
import type { DomainRecord } from "../src/shared/contracts";
import { calendarTimeProposals } from "../src/modules/time-tracking/calendar-proposals";

const event = (id: string, start: string, end: string, data: Record<string, unknown> = {}) =>
  ({
    id,
    kind: "events",
    organizationId: "fictional",
    departmentId: "mask",
    createdBy: "mara",
    createdAt: "2026-10-04T08:00Z",
    updatedAt: "2026-10-04T08:00Z",
    version: 1,
    data: { title: id, category: "service", participantIds: ["mara"], start, end, ...data },
  }) as DomainRecord;
const booking = (start: string, end: string, data: Record<string, unknown> = {}) =>
  ({
    id: "booked",
    kind: "time",
    organizationId: "fictional",
    departmentId: "mask",
    createdBy: "mara",
    createdAt: "2026-10-04T08:00Z",
    updatedAt: "2026-10-04T08:00Z",
    version: 1,
    data: { userId: "mara", start, end, ...data },
  }) as DomainRecord;
const propose = (options: Partial<Parameters<typeof calendarTimeProposals>[0]>) =>
  calendarTimeProposals({
    kind: "attendance",
    userId: "mara",
    week: "2026-09-28",
    now: new Date("2026-10-05T12:00+02:00"),
    events: [],
    bookings: [],
    timeCategoryKeys: ["production", "office", "other"],
    ...options,
  });
const clocks = (result: ReturnType<typeof propose>) =>
  result.proposals.map(({ start, end }) => [start, end]);

describe("unconfirmed calendar time suggestions", () => {
  it("unions attendance overlaps and preserves a real gap", () => {
    const result = propose({
      events: [
        event("Dienst", "2026-09-30T08:00Z", "2026-09-30T11:00Z"),
        event("Probe", "2026-09-30T10:00Z", "2026-09-30T12:00Z"),
        event("Abend", "2026-09-30T17:00Z", "2026-09-30T20:00Z"),
      ],
    });
    expect(clocks(result)).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T12:00:00.000Z"],
      ["2026-09-30T17:00:00.000Z", "2026-09-30T20:00:00.000Z"],
    ]);
    expect(result.proposals[0].sourceLabels).toEqual(["Dienst", "Probe"]);
  });
  it("subtracts existing intervals including pauses, and does not recreate saved proposals", () => {
    const events = [event("Dienst", "2026-09-30T08:00Z", "2026-09-30T12:00Z")];
    const result = propose({
      events,
      bookings: [booking("2026-09-30T09:00Z", "2026-09-30T11:00Z", { pauseSeconds: 1800 })],
    });
    expect(clocks(result)).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T09:00:00.000Z"],
      ["2026-09-30T11:00:00.000Z", "2026-09-30T12:00:00.000Z"],
    ]);
    expect(
      propose({ events, bookings: [booking("2026-09-30T08:00Z", "2026-09-30T12:00Z")] }).proposals,
    ).toEqual([]);
    expect(
      propose({ events, reviewed: [{ start: "2026-09-30T08:00Z", end: "2026-09-30T12:00Z" }] })
        .proposals,
    ).toEqual([]);
  });
  it("excludes absence, custom all-day categories, another person and unfinished future intervals", () => {
    const result = propose({
      events: [
        event("Frei", "2026-09-30T00:00Z", "2026-10-01T00:00Z", { allDay: true }),
        event("Urlaub", "2026-09-30T08:00Z", "2026-09-30T10:00Z", { category: "vacation" }),
        event("Eigene Kategorie", "2026-09-30T08:00Z", "2026-09-30T10:00Z", { category: "frei" }),
        event("Nora", "2026-09-30T08:00Z", "2026-09-30T10:00Z", { participantIds: ["nora"] }),
        event("Noch nicht beendet", "2026-10-04T08:00Z", "2026-10-04T12:00Z"),
      ],
      now: new Date("2026-10-04T10:00Z"),
      calendarCategories: [
        {
          ...booking("", ""),
          id: "frei",
          kind: "calendarCategories",
          data: { key: "frei", name: "Frei", allDay: true },
        },
      ],
    });
    expect(result.proposals).toEqual([]);
  });
  it("keeps Berlin overnight recurrence and DST, clips week and calendar year boundaries", () => {
    const result = propose({
      week: "2026-10-19",
      now: new Date("2026-10-26T12:00+01:00"),
      events: [
        event("Nachtdienst", "2026-10-24T23:00+02:00", "2026-10-25T04:00+01:00", {
          recurrence: "daily",
          until: "2026-10-25",
        }),
      ],
    });
    expect(result.proposals.map((row) => row.seconds)).toEqual([21600, 3600]);
    const boundary = propose({
      week: "2026-12-28",
      period: { year: 2027 },
      now: new Date("2027-01-04T12:00+01:00"),
      events: [event("Silvester", "2026-12-31T23:00+01:00", "2027-01-01T02:00+01:00")],
    });
    expect(clocks(boundary)).toEqual([["2026-12-31T23:00:00.000Z", "2027-01-01T01:00:00.000Z"]]);
  });
  it("preserves work production/activity and omits ambiguous calendar overlaps", () => {
    const result = propose({
      kind: "time",
      events: [
        event("Perückenprobe", "2026-09-30T08:00Z", "2026-09-30T11:00Z", {
          productionId: "p",
          category: "rehearsal",
        }),
        event("Vorstellung", "2026-09-30T10:00Z", "2026-09-30T12:00Z", {
          productionId: "q",
          category: "performance",
        }),
      ],
    });
    expect(result.overlappingEvents).toBe(true);
    expect(clocks(result)).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T10:00:00.000Z"],
      ["2026-09-30T11:00:00.000Z", "2026-09-30T12:00:00.000Z"],
    ]);
    expect(result.proposals.map((row) => row.data)).toMatchObject([
      { title: "Perückenprobe", productionId: "p", category: "production", pauseSeconds: 0 },
      { title: "Vorstellung", productionId: "q", category: "production", pauseSeconds: 0 },
    ]);
  });
  it("lets foreground work take precedence within Dienst without counting its hours twice", () => {
    const events = [
      event("Tagesdienst", "2026-09-30T08:00Z", "2026-09-30T14:00Z"),
      event("Probe", "2026-09-30T10:00Z", "2026-09-30T12:00Z", {
        category: "rehearsal",
        productionId: "p",
      }),
      event("Zusätzlicher TD", "2026-09-30T09:00Z", "2026-09-30T13:00Z"),
    ];
    const work = propose({ kind: "time", events });
    expect(work.overlappingEvents).toBe(false);
    expect(clocks(work)).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T10:00:00.000Z"],
      ["2026-09-30T10:00:00.000Z", "2026-09-30T12:00:00.000Z"],
      ["2026-09-30T12:00:00.000Z", "2026-09-30T14:00:00.000Z"],
    ]);
    expect(work.proposals[1].data).toMatchObject({ title: "Probe", productionId: "p" });
    expect(work.proposals.reduce((sum, row) => sum + row.seconds, 0)).toBe(6 * 3600);
    expect(clocks(propose({ events }))).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T14:00:00.000Z"],
    ]);
  });
  it("does not fill a true foreground collision with background service or filtered-out work", () => {
    const events = [
      event("Dienst", "2026-09-30T08:00Z", "2026-09-30T14:00Z", { productionId: "p" }),
      event("Probe", "2026-09-30T10:00Z", "2026-09-30T12:00Z", {
        category: "rehearsal",
        productionId: "q",
      }),
      event("Vorstellung", "2026-09-30T11:00Z", "2026-09-30T13:00Z", {
        category: "performance",
        productionId: "q",
      }),
    ];
    const work = propose({ kind: "time", events });
    expect(work.overlappingEvents).toBe(true);
    expect(work.proposals.reduce((sum, row) => sum + row.seconds, 0)).toBe(5 * 3600);
    expect(clocks(propose({ kind: "time", events, productionId: "p" }))).toEqual([
      ["2026-09-30T08:00:00.000Z", "2026-09-30T10:00:00.000Z"],
      ["2026-09-30T13:00:00.000Z", "2026-09-30T14:00:00.000Z"],
    ]);
  });
  it("does not suggest new clock ranges on a day with existing duration-only work", () => {
    const result = propose({
      kind: "time",
      events: [event("Dienst", "2026-09-30T08:00Z", "2026-09-30T12:00Z")],
      bookings: [booking("", "", { date: "2026-09-30", durationSeconds: 7200 })],
    });
    expect(result.undatedBookings).toBe(true);
    expect(result.proposals).toEqual([]);
  });
  it("blocks a full absent day but keeps timed work on a half-day-off marker", () => {
    const work = event("Dienst", "2026-09-30T08:00Z", "2026-09-30T12:00Z");
    const free = event("Frei", "2026-09-29T22:00Z", "2026-09-30T22:00Z", {
      category: "rest",
      allDay: true,
    });
    expect(propose({ events: [work, free] })).toMatchObject({
      proposals: [],
      blockedDayEvents: true,
    });
    expect(
      propose({ events: [work, { ...free, data: { ...free.data, category: "half-day-off" } }] })
        .proposals,
    ).toHaveLength(1);
  });
});
