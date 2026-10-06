import type { DomainRecord } from "@/shared/contracts";
import { calendarPresentation } from "@/shared/calendar-categories";
import { shiftDate, value } from "@/shared/client-api";
import { dateMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { occurrences } from "@/modules/calendar/occurrences";
import { localDay, startOfLocalDay } from "./rules";

export interface TimeDayMarker {
  date: string;
  label: string;
  title: string;
  color: string;
  event: DomainRecord;
}

/** Calendar day labels carry no attendance or production duration. End dates are exclusive. */
export function timeDayMarkers({
  events,
  calendarCategories = [],
  userId,
  from,
  to,
  period = {},
}: {
  events: DomainRecord[];
  calendarCategories?: DomainRecord[];
  userId: string;
  from: string;
  to: string;
  period?: PeriodFilter;
}): TimeDayMarker[] {
  const markers: TimeDayMarker[] = [];
  const seen = new Set<string>();
  if (from > to) return markers;
  for (const event of events) {
    if (!Array.isArray(event.data.participantIds) || !event.data.participantIds.includes(userId))
      continue;
    const presentation = calendarPresentation(event, [], calendarCategories);
    if (
      !presentation.allDay ||
      !Number.isFinite(new Date(value(event.data, "start")).getTime()) ||
      !Number.isFinite(new Date(value(event.data, "end")).getTime())
    )
      continue;
    for (const occurrence of occurrences(
      event,
      startOfLocalDay(from),
      startOfLocalDay(shiftDate(to, 1)),
    )) {
      if (occurrence.end <= occurrence.start) continue;
      const finalDay = localDay(new Date(occurrence.end.getTime() - 1));
      let day = localDay(occurrence.start);
      if (day < from) day = from;
      for (; day <= finalDay && day <= to; day = shiftDate(day, 1)) {
        const identity = `${event.id}:${day}`;
        if (seen.has(identity) || !dateMatchesPeriod(day, period)) continue;
        seen.add(identity);
        markers.push({
          date: day,
          label: presentation.categoryName,
          title: value(event.data, "title").trim(),
          color: presentation.color,
          event,
        });
      }
    }
  }
  return markers.sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, "de"),
  );
}
