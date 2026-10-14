import { describe, expect, it, vi } from "vitest";
import type { DomainRecord, RecordData } from "../src/shared/contracts";
import type { Transaction } from "../src/platform/db";
import type { Context } from "../src/platform/context";
import { records } from "../src/platform/db/schema";
import {
  calendarCategoryCreditsTime,
  calendarPresentation,
  defaultCalendarCategories,
  neutralCalendarData,
} from "../src/shared/calendar-categories";
import {
  normalizeEventCategory,
  validateCalendarCategory,
} from "../src/modules/calendar/categories";
import { calculateAttendanceBalance } from "../src/modules/time-tracking/balance";
import { calendarTimeProposals } from "../src/modules/time-tracking/calendar-proposals";
import { buildIcs } from "../src/modules/exports/ical";

const record = (kind: DomainRecord["kind"], data: RecordData): DomainRecord => ({
  id: `fictional-${kind}`,
  kind,
  data,
  organizationId: "fictional-theatre",
  departmentId: "fictional-makeup",
  createdBy: "mara",
  createdAt: "2026-10-05T08:00:00Z",
  updatedAt: "2026-10-05T08:00:00Z",
  version: 3,
});
const context = { departmentId: "fictional-makeup" } as Context;
const category = { key: "absent", name: "Absent", color: "#b86d73", allDay: true };
const event = {
  category: "sick",
  title: "Krank",
  start: "2026-10-06T00:00:00+02:00",
  end: "2026-10-07T00:00:00+02:00",
  participantIds: ["mara"],
  allDay: true,
};

function transaction(result: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  const tx = { select: vi.fn(() => query), execute: vi.fn().mockResolvedValue([]) };
  return { tx: tx as unknown as Transaction, select: tx.select };
}

describe("neutral Absent calendar category", () => {
  it("uses a neutral default key while keeping general absence distinct and uncredited", () => {
    expect(defaultCalendarCategories.find((row) => row.key === "absent")).toEqual(category);
    expect(defaultCalendarCategories.some((row) => (row.key as string) === "sick")).toBe(false);
    expect(calendarCategoryCreditsTime("absent")).toBe(true);
    expect(calendarCategoryCreditsTime("sick")).toBe(true);
    expect(calendarCategoryCreditsTime("absence", { name: "Abwesenheit" })).toBe(false);
  });

  it("rewrites structured data without mutating the input or losing other fields", () => {
    const old = { ...category, key: "sick", name: "Krank", blocksTime: false };
    const normalized = neutralCalendarData("calendarCategories", old);
    expect(normalized).toEqual({ ...category, blocksTime: false });
    expect(old.key).toBe("sick");
    expect(neutralCalendarData("calendarCategories", normalized)).toBe(normalized);
    expect(neutralCalendarData("events", event)).toEqual({
      ...event,
      category: "absent",
      title: "Absent",
    });
    expect(event.category).toBe("sick");
  });

  it.each(["sick", "absent"])("shows Absent for %s events and older category references", (key) => {
    const row = record("events", { ...event, category: key });
    const definitions = [record("calendarCategories", { ...category, key: "sick", name: "Krank" })];
    expect(calendarPresentation(row, [], definitions)).toMatchObject({
      title: "Absent",
      categoryName: "Absent",
      color: category.color,
      allDay: true,
      blocksTime: true,
    });
    expect(calendarPresentation(row)).toMatchObject({ title: "Absent", categoryName: "Absent" });
  });

  it("renames generated calendar notices but preserves personal messages and custom titles", () => {
    const generated = { type: "ServiceChangedV1", body: "Krank", read: true, userId: "mara" };
    expect(neutralCalendarData("notifications", generated)).toEqual({
      ...generated,
      body: "Absent",
    });
    const chat = { ...generated, type: "ChatMessageCreatedV1" };
    expect(neutralCalendarData("notifications", chat)).toBe(chat);
    const message = { text: "Ich war krank", category: "sick" };
    expect(neutralCalendarData("messages", message)).toBe(message);
    const custom = { ...event, title: "Persönliche Notiz" };
    expect(neutralCalendarData("events", custom)).toEqual({ ...custom, category: "absent" });
  });

  it.each([15, 20, 39])(
    "preserves the complete balance and the sixth-of-week credit at %i weekly hours",
    (weeklyHours) => {
      const input = {
        userId: "mara",
        settings: {
          version: 1,
          openingBalanceSeconds: 7200,
          schedules: [
            {
              effectiveFrom: "2026-10-05",
              weeklyMinutes: weeklyHours * 60,
              workingDays: [1, 2, 3, 4, 5, 6],
            },
          ],
        },
        attendance: [
          record("attendance", {
            date: "2026-10-05",
            durationSeconds: weeklyHours * 3600,
            userId: "mara",
          }),
        ],
        events: [record("events", event)],
        calendarCategories: [
          record("calendarCategories", { ...category, key: "sick", name: "Krank" }),
        ],
        now: new Date("2026-10-12T12:00:00+02:00"),
      };
      const before = calculateAttendanceBalance(input);
      const after = calculateAttendanceBalance({
        ...input,
        events: input.events.map((row) => ({
          ...row,
          data: neutralCalendarData(row.kind, row.data),
        })),
        calendarCategories: input.calendarCategories.map((row) => ({
          ...row,
          data: neutralCalendarData(row.kind, row.data),
        })),
      });
      expect(after).toEqual(before);
      expect(after.creditSeconds).toBe((weeklyHours * 3600) / 6);
      expect(after.completed.balanceSeconds).toBe(7200 + (weeklyHours * 3600) / 6);
    },
  );

  it("never proposes an Absent day as worked attendance or production time", () => {
    for (const kind of ["attendance", "time"] as const) {
      const result = calendarTimeProposals({
        kind,
        userId: "mara",
        week: "2026-10-05",
        now: new Date("2026-10-12T12:00:00Z"),
        events: [record("events", neutralCalendarData("events", event))],
        bookings: [],
      });
      expect(result.proposals).toEqual([]);
    }
  });

  it("exports the neutral label even from a legacy cached event", () => {
    const text = new TextDecoder().decode(
      buildIcs({
        kind: "events",
        format: "ics",
        organization: "Fiktiv",
        department: "Maske",
        members: [],
        records: [record("events", event)],
      }),
    );
    expect(text).toContain("SUMMARY:Absent");
    expect(text).not.toContain("Krank");
  });

  it.each(["sick", "absent"])(
    "saves an older %s event using one scoped category lookup",
    async (key) => {
      const { tx, select } = transaction([{ data: { ...category, key: "sick", name: "Krank" } }]);
      const data = { ...event, category: key };
      expect(await normalizeEventCategory(context, data, tx)).toBe("Absent");
      expect(data).toMatchObject({ category: "absent", title: "Absent", allDay: true });
      expect(select).toHaveBeenCalledTimes(1);
      expect(data.start).toBe("2026-10-05T22:00:00.000Z");
    },
  );

  it("lets an old open category form update the migrated record without restoring its old key", async () => {
    const { tx, select } = transaction([]);
    const data = { ...category, key: "sick", name: "Krank" };
    const existing: typeof records.$inferSelect = {
      ...record("calendarCategories", category),
      id: "stable-id",
      createdAt: new Date("2026-10-05T08:00:00Z"),
      updatedAt: new Date("2026-10-05T08:00:00Z"),
      productionId: null,
      ownerId: null,
      parentId: null,
      startAt: null,
      endAt: null,
    };
    await validateCalendarCategory(context, data, tx, existing);
    expect(data).toEqual(category);
    expect(select).toHaveBeenCalledTimes(1);
  });
});
