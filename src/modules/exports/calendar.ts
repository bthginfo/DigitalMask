import { addDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

export const localDay = (date: Date) => formatInTimeZone(date, "Europe/Berlin", "yyyy-MM-dd");
export function calendarRange(input: ExportInput): { from: string; to: string } {
  const eventDays = input.records
    .filter((r) => r.kind === "events")
    .map((r) => String(r.data.start ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const firstDay = eventDays[0] ?? localDay(new Date());
  const from =
    input.from ??
    (input.view === "month" ? format(startOfMonth(parseISO(firstDay)), "yyyy-MM-dd") : firstDay);
  const defaultEnd =
    input.view === "month"
      ? endOfMonth(parseISO(from))
      : addDays(parseISO(from), input.view === "day" ? 0 : 6);
  const to =
    input.to ??
    (!input.view && !input.from && eventDays.length
      ? eventDays[eventDays.length - 1]
      : format(defaultEnd, "yyyy-MM-dd"));
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(+parseISO(from)) ||
    !Number.isFinite(+parseISO(to)) ||
    from > to ||
    (+parseISO(to) - +parseISO(from)) / 86400000 > 730
  )
    throw new Error("Bitte einen gültigen Kalenderzeitraum von höchstens zwei Jahren auswählen.");
  return { from, to };
}
/** Recurrence expansion is entirely in memory; wall-clock appointments keep their local time over DST. */
export function expandCalendar(input: ExportInput): ExportInput {
  const range = calendarRange(input);
  const rangeStart = fromZonedTime(`${range.from}T00:00:00`, "Europe/Berlin");
  const rangeEnd = fromZonedTime(`${range.to}T23:59:59.999`, "Europe/Berlin");
  const records: DomainRecord[] = [];
  for (const record of input.records.filter((r) => r.kind === "events")) {
    const start = new Date(String(record.data.start)),
      end = new Date(String(record.data.end));
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
      throw new Error("Ein Kalendertermin hat ungültige Zeitangaben.");
    const recurrence = record.data.recurrence;
    if (recurrence !== "daily" && recurrence !== "weekly") {
      if (start <= rangeEnd && end > rangeStart) records.push(record);
      continue;
    }
    const interval = recurrence === "weekly" ? 7 : 1;
    const startDay = localDay(start),
      clock = formatInTimeZone(start, "Europe/Berlin", "HH:mm:ss");
    const elapsedDays = Math.floor((+parseISO(range.from) - +parseISO(startDay)) / 86400000);
    let iteration = Math.max(
      0,
      Math.floor((elapsedDays - Math.ceil((+end - +start) / 86400000)) / interval),
    );
    const until =
      typeof record.data.until === "string" && record.data.until ? record.data.until : range.to;
    const exceptions = Array.isArray(record.data.exceptions) ? record.data.exceptions : [];
    for (; iteration < 100000; iteration++) {
      const day = format(addDays(parseISO(startDay), iteration * interval), "yyyy-MM-dd");
      if (day > range.to || day > until) break;
      if (exceptions.includes(day)) continue;
      const occurrenceStart = fromZonedTime(`${day}T${clock}`, "Europe/Berlin");
      const occurrenceEnd = new Date(+occurrenceStart + +end - +start);
      if (occurrenceStart <= rangeEnd && occurrenceEnd > rangeStart)
        records.push({
          ...record,
          id: `${record.id}@${day}`,
          data: {
            ...record.data,
            start: occurrenceStart.toISOString(),
            end: occurrenceEnd.toISOString(),
            recurrence: "none",
          },
        });
      if (records.length > 20000)
        throw new Error(
          "Der Export umfasst zu viele Termine. Bitte einen kürzeren Zeitraum wählen.",
        );
    }
  }
  records.sort((a, b) => String(a.data.start).localeCompare(String(b.data.start)));
  return { ...input, records, from: range.from, to: range.to };
}
