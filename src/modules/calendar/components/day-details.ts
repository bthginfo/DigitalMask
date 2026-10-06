import { dateLabel, instantDate, localDate, shiftDate } from "@/shared/client-api";
import type { CalendarInstance } from "./team-calendar";

export const calendarDayLabel = (day: string) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instantDate(day));

export function calendarDayEntries(events: CalendarInstance[], day: string) {
  return events
    .filter(
      (event) =>
        localDate(new Date(event.start)) <= day &&
        localDate(new Date(new Date(event.end).getTime() - 1)) >= day,
    )
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start.localeCompare(b.start) ||
        a.title.localeCompare(b.title, "de"),
    );
}

export function calendarDayIndex(events: CalendarInstance[], from: string, through: string) {
  const days = new Map<string, CalendarInstance[]>();
  for (let day = from; day <= through; day = shiftDate(day, 1)) {
    days.set(day, calendarDayEntries(events, day));
  }
  return days;
}

export function calendarInstanceTime(event: CalendarInstance) {
  if (event.allDay) return "Ganztägig";
  const clock = (date: string) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  return localDate(new Date(event.start)) === localDate(new Date(event.end))
    ? `${clock(event.start)}–${clock(event.end)}`
    : `${dateLabel(event.start, true)} – ${dateLabel(event.end, true)}`;
}
