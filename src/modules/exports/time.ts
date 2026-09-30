import type { ExportInput } from "./types";
import type { DomainRecord } from "../../shared/contracts";
import { durationSeconds } from "./data";

/** Server-computed local-day allocations preserve exact totals across midnight, DST and export boundaries. */
export function expandTime(input: ExportInput): ExportInput {
  const records: DomainRecord[] = [];
  const inside = (day: string) =>
    (!input.from || day >= input.from) && (!input.to || day <= input.to);
  for (const record of input.records.filter((r) => r.kind === "time")) {
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
