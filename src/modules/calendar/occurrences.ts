import { addDays, parseISO, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DomainRecord } from "@/shared/contracts";
import { THEATER_ZONE } from "@/modules/time-tracking/rules";
export function occurrences(event: DomainRecord, from: Date, to: Date) {
  const start = new Date(String(event.data.start)),
    end = new Date(String(event.data.end));
  const period = event.data.recurrence === "daily" ? 1 : event.data.recurrence === "weekly" ? 7 : 0;
  const result: { start: Date; end: Date }[] = [];
  const exceptions = Array.isArray(event.data.exceptions) ? event.data.exceptions : [];
  if (!period) {
    // Single events need no zoned date arithmetic; the result matches the series loop below.
    if (!(start < to) || !(end > from)) return result;
    if (event.data.until && start > fromZonedTime(`${event.data.until}T23:59:59`, THEATER_ZONE))
      return result;
    if (
      exceptions.length &&
      exceptions.includes(formatInTimeZone(start, THEATER_ZONE, "yyyy-MM-dd"))
    )
      return result;
    result.push({ start, end });
    return result;
  }
  let date = formatInTimeZone(start, THEATER_ZONE, "yyyy-MM-dd");
  const clock = formatInTimeZone(start, THEATER_ZONE, "HH:mm:ss");
  const endClock = formatInTimeZone(end, THEATER_ZONE, "HH:mm:ss");
  const endDate = formatInTimeZone(end, THEATER_ZONE, "yyyy-MM-dd");
  const daySpan = Math.round(
    (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000,
  );
  const last = event.data.until ? fromZonedTime(`${event.data.until}T23:59:59`, THEATER_ZONE) : to;
  if (period) {
    const fromDay = formatInTimeZone(from, THEATER_ZONE, "yyyy-MM-dd");
    const distance = Math.floor(
      (Date.parse(`${fromDay}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000,
    );
    const jump = Math.max(0, Math.floor((distance - daySpan) / period) - 1);
    date = format(addDays(parseISO(date), jump * period), "yyyy-MM-dd");
  }
  for (let count = 0; count < 2000; count++) {
    const a = period ? fromZonedTime(`${date}T${clock}`, THEATER_ZONE) : start;
    const b = period
      ? fromZonedTime(
          `${format(addDays(parseISO(date), daySpan), "yyyy-MM-dd")}T${endClock}`,
          THEATER_ZONE,
        )
      : end;
    if (a >= to || a > last) break;
    if (b > from && !exceptions.includes(date)) result.push({ start: a, end: b });
    if (!period) break;
    date = format(addDays(parseISO(date), period), "yyyy-MM-dd");
  }
  return result;
}
