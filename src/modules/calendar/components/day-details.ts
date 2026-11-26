import { dateLabel, instantDate, localDate, shiftDate } from "@/shared/client-api";
import { berlinClock, dateFormat } from "@/shared/intl";
import type { CalendarInstance } from "./team-calendar";

const dayLabelFormat = dateFormat({
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "long",
});
export const calendarDayLabel = (day: string) => dayLabelFormat.format(instantDate(day));

const entryOrder = (a: CalendarInstance, b: CalendarInstance) =>
  Number(b.allDay) - Number(a.allDay) ||
  a.start.localeCompare(b.start) ||
  a.title.localeCompare(b.title, "de");
const firstDay = (event: CalendarInstance) => localDate(new Date(event.start));
const lastDay = (event: CalendarInstance) => localDate(new Date(new Date(event.end).getTime() - 1));

export function calendarDayEntries(events: CalendarInstance[], day: string) {
  return events.filter((event) => firstDay(event) <= day && lastDay(event) >= day).sort(entryOrder);
}

/** One pass over the events: each instance is placed on the days it covers. */
export function calendarDayIndex(events: CalendarInstance[], from: string, through: string) {
  const days = new Map<string, CalendarInstance[]>();
  for (let day = from; day <= through; day = shiftDate(day, 1)) days.set(day, []);
  for (const event of events) {
    const first = firstDay(event),
      last = lastDay(event);
    for (let day = first < from ? from : first; day <= last && day <= through;) {
      days.get(day)?.push(event);
      day = shiftDate(day, 1);
    }
  }
  for (const entries of days.values()) entries.sort(entryOrder);
  return days;
}

export function calendarInstanceTime(event: CalendarInstance) {
  if (event.allDay) return "Ganztägig";
  const clock = (date: string) => berlinClock.format(new Date(date));
  return localDate(new Date(event.start)) === localDate(new Date(event.end))
    ? `${clock(event.start)}–${clock(event.end)}`
    : `${dateLabel(event.start, true)} – ${dateLabel(event.end, true)}`;
}
