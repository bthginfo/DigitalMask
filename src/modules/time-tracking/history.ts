import type { DomainRecord, Member } from "@/shared/contracts";
import { instantDate, shiftDate, timeAllocations, weekStart } from "@/shared/client-api";
import { dateMatchesPeriod, seasonForDate, type PeriodFilter } from "@/shared/period-filter";
import type { TimeDayMarker } from "./day-markers";

export interface BookingWeekEntry {
  record: DomainRecord;
  seconds: number;
  allocations: { date: string; seconds: number }[];
}
export interface BookingWeek {
  start: string;
  end: string;
  number: number;
  year: number;
  seconds: number;
  entries: BookingWeekEntry[];
  markers: TimeDayMarker[];
}

/** ISO week-year follows the Thursday, including weeks that cross New Year's Day. */
export function isoWeek(day: string) {
  const start = weekStart(instantDate(day));
  const year = Number(shiftDate(start, 3).slice(0, 4));
  const first = weekStart(instantDate(`${year}-01-04`));
  const number =
    Math.round((Date.parse(`${start}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 604800000) +
    1;
  return { start, end: shiftDate(start, 6), number, year };
}

/** Each allocation belongs to exactly one week; filters clip days, never entire bookings. */
export function groupBookingWeeks(
  records: DomainRecord[],
  {
    userId,
    productionId = "",
    period = {},
    markers = [],
  }: {
    userId: string | undefined;
    productionId?: string;
    period?: PeriodFilter;
    markers?: TimeDayMarker[];
  },
): BookingWeek[] {
  const weeks = new Map<string, BookingWeek>();
  for (const record of records) {
    if (
      (userId !== undefined && record.data.userId !== userId) ||
      (productionId && record.data.productionId !== productionId)
    )
      continue;
    for (const day of timeAllocations(record.data)) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
        !Number.isFinite(day.seconds) ||
        day.seconds <= 0 ||
        !dateMatchesPeriod(day.date, period)
      )
        continue;
      const identity = isoWeek(day.date);
      let week = weeks.get(identity.start);
      if (!week) {
        week = { ...identity, seconds: 0, entries: [], markers: [] };
        weeks.set(identity.start, week);
      }
      let entry = week.entries.find((row) => row.record.id === record.id);
      if (!entry) {
        entry = { record, seconds: 0, allocations: [] };
        week.entries.push(entry);
      }
      entry.allocations.push(day);
      entry.seconds += day.seconds;
      week.seconds += day.seconds;
    }
  }
  for (const marker of markers) {
    if (!dateMatchesPeriod(marker.date, period)) continue;
    const identity = isoWeek(marker.date);
    let week = weeks.get(identity.start);
    if (!week) {
      week = { ...identity, seconds: 0, entries: [], markers: [] };
      weeks.set(identity.start, week);
    }
    week.markers.push(marker);
  }
  return [...weeks.values()]
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((week) => ({
      ...week,
      entries: week.entries.sort(
        (a, b) =>
          (b.allocations.at(-1)?.date || "").localeCompare(a.allocations.at(-1)?.date || "") ||
          String(b.record.data.start || "").localeCompare(String(a.record.data.start || "")),
      ),
    }));
}

/** Group the existing, period-clipped bookings without loading each person's records again. */
export function groupBookingPeople(entries: BookingWeekEntry[], members: Member[]) {
  const people = new Map<
    string,
    { userId: string; name: string; former: boolean; seconds: number; entries: BookingWeekEntry[] }
  >();
  for (const entry of entries) {
    const userId = String(entry.record.data.userId || "");
    let person = people.get(userId);
    if (!person) {
      const member = members.find((row) => row.id === userId);
      person = {
        userId,
        name: member?.name || "Ehemaliges Teammitglied",
        former: !member || member.status !== "active",
        seconds: 0,
        entries: [],
      };
      people.set(userId, person);
    }
    person.seconds += entry.seconds;
    person.entries.push(entry);
  }
  return [...people.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "de") || a.userId.localeCompare(b.userId),
  );
}

/** A deliberate week change must never be hidden by the previous year or season. */
export function periodForWeek(
  period: PeriodFilter,
  start: string,
  productions: DomainRecord[] = [],
): PeriodFilter {
  const end = shiftDate(start, 6);
  const next = { ...period };
  if (period.year) {
    if (start.slice(0, 4) === end.slice(0, 4)) next.year = Number(start.slice(0, 4));
    else delete next.year;
  }
  if (period.season) {
    const first = seasonForDate(productions, instantDate(start));
    const last = seasonForDate(productions, instantDate(end));
    if (first === last) next.season = first;
    else delete next.season;
  }
  return next;
}
