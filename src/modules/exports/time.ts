import type { ExportInput } from "./types";
import type { DomainRecord } from "../../shared/contracts";
import { durationSeconds } from "./data";
import { timeDayMarkers } from "../time-tracking/day-markers";
import { isoWeek } from "../time-tracking/history";
import { localDate } from "../../shared/client-api";

export interface ExportTimeDayMarker {
  date: string;
  userId: string;
  person: string;
  label: string;
  title: string;
  week: string;
}

/** Supplementary calendar metadata, deliberately separate from reimportable time records. */
export function exportTimeDayMarkers(input: ExportInput): ExportTimeDayMarker[] {
  if (!["time", "attendance"].includes(input.kind)) return [];
  const events = input.references?.events || [];
  const dates = [
    ...input.records.map((record) => String(record.data.date || "")),
    ...events.map((event) => String(event.data.start || "").slice(0, 10)),
  ]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  const from = input.from || dates[0] || localDate();
  const to = input.to || [localDate(), dates.at(-1) || ""].sort().at(-1)!;
  return input.members
    .filter(
      (member) =>
        member.role !== "superadmin" &&
        (input.userIds === undefined || input.userIds.includes(member.id)),
    )
    .flatMap((member) =>
      timeDayMarkers({
        events,
        calendarCategories: input.references?.calendarCategories,
        userId: member.id,
        from,
        to,
        period: { season: input.season, year: input.year },
      }).map((marker) => ({
        date: marker.date,
        userId: member.id,
        person: member.name,
        label: marker.label,
        title: marker.title,
        week: `KW ${isoWeek(marker.date).number} · ${isoWeek(marker.date).year}`,
      })),
    );
}

/** Server-computed local-day allocations preserve exact totals across midnight, DST and export boundaries. */
export function expandTime(input: ExportInput): ExportInput {
  const records: DomainRecord[] = [];
  const inside = (day: string) =>
    (!input.from || day >= input.from) && (!input.to || day <= input.to);
  for (const record of input.records.filter(
    (r) => r.kind === input.kind && ["time", "attendance"].includes(r.kind),
  )) {
    const allocations = record.data.dayAllocations;
    if (!Array.isArray(allocations) || allocations.length === 0) {
      if (inside(String(record.data.date ?? ""))) records.push(record);
      continue;
    }
    const days = allocations.map((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof item.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
        typeof item.seconds !== "number" ||
        !Number.isInteger(item.seconds) ||
        item.seconds < 0
      )
        throw new Error("Die Tagesaufteilung einer Zeitbuchung ist ungültig.");
      return { date: item.date, seconds: item.seconds };
    });
    if (days.reduce((sum, day) => sum + day.seconds, 0) !== durationSeconds(record))
      throw new Error("Die Tagesaufteilung stimmt nicht mit der gebuchten Dauer überein.");
    for (const day of days)
      if (inside(day.date) && day.seconds)
        records.push({
          ...record,
          id: `${record.id}@${day.date}`,
          data: {
            ...record.data,
            date: day.date,
            start: "",
            end: "",
            durationSeconds: day.seconds,
          },
        });
  }
  records.sort((a, b) => String(a.data.date).localeCompare(String(b.data.date)));
  return { ...input, records };
}
