import type { RecordData } from "@/shared/contracts";
import { instantDate, localDate, localDateTime, value } from "@/shared/client-api";

/**
 * Initial form times for a booking. Defaults may carry a date, a start and an end (ISO or
 * Berlin-local), e.g. from a past calendar event; those win over today's date.
 */
export function initialBookingTimes(initial: RecordData, today = localDate()) {
  const start = initial.start ? localDateTime(String(initial.start)) : "";
  const date = value(initial, "date") || start.slice(0, 10) || today;
  const end = initial.end
    ? localDateTime(String(initial.end))
    : start
      ? localDateTime(new Date(instantDate(start).getTime() + 3600_000).toISOString())
      : `${date}T17:00`;
  return { date, start: start || `${date}T09:00`, end };
}
