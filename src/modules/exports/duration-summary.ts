import { format, parseISO } from "date-fns";
import { durationSeconds } from "./data";
import type { ExportRow } from "./types";

export interface DurationSummary {
  total: number;
  people: [string, number][];
  days: [string, number][];
  weeks: [string, number][];
}
export function durationSummary(rows: ExportRow[]): DurationSummary {
  const people = new Map<string, number>(),
    days = new Map<string, number>(),
    weeks = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const seconds = durationSeconds(row.record),
      day = String(row.record.data.date ?? "");
    total += seconds;
    const person = String(row.values.person) || "Person nicht verfügbar";
    people.set(person, (people.get(person) ?? 0) + seconds);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+parseISO(day))) {
      days.set(day, (days.get(day) ?? 0) + seconds);
      const week = `${format(parseISO(day), "RRRR")} / KW ${format(parseISO(day), "II")}`;
      weeks.set(week, (weeks.get(week) ?? 0) + seconds);
    }
  }
  return {
    total,
    people: [...people],
    days: [...days].sort(([a], [b]) => a.localeCompare(b)),
    weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)),
  };
}
