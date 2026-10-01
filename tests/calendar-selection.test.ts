import { describe, expect, it } from "vitest";
import { calendarEventSelected } from "../src/shared/calendar-selection";
import { selectExportRecords } from "../src/modules/exports/selection";
import type { DomainRecord } from "../src/shared/contracts";

describe("personal calendar selection", () => {
  const mine = { participantIds: ["me"] };
  const other = { participantIds: ["magdalena"] };
  it("shows only selected calendars and never treats an empty selection as all", () => {
    expect(calendarEventSelected(mine, ["me"])).toBe(true);
    expect(calendarEventSelected(other, ["me"])).toBe(false);
    expect(calendarEventSelected(other, ["me", "magdalena"])).toBe(true);
    expect(calendarEventSelected(other, [])).toBe(false);
    expect(calendarEventSelected(mine, [])).toBe(false);
    expect(calendarEventSelected({ participantIds: [] }, ["me"])).toBe(false);
  });
  it("explicit all mode includes unassigned team events", () => {
    expect(calendarEventSelected(other, [], true)).toBe(true);
    expect(calendarEventSelected({ participantIds: [] }, [], true)).toBe(true);
  });
  it("empty and selected exports match the visible calendars", () => {
    const records: DomainRecord[] = [mine, other, { participantIds: [] }].map((data, id) => ({
      kind: "events" as const,
      id: String(id),
      organizationId: "theatre",
      departmentId: "maske",
      createdBy: "me",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
      version: 1,
      data,
    }));
    expect(selectExportRecords({ kind: "events", records, userIds: [] })).toEqual([]);
    expect(selectExportRecords({ kind: "events", records, userIds: ["me"] })).toEqual([records[0]]);
    expect(selectExportRecords({ kind: "events", records })).toEqual(records);
  });
});
