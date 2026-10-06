import { calendarEventPaint } from "../../shared/calendar-paint";
import { eventDisplay } from "./calendar-presentation";
import { eventTimeLabel, memberDayEvents } from "./team-calendar";
import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

/** Complete cell entries shared by the printable PDF and Excel matrices. */
export function teamPrintEntries(input: ExportInput, day: string, memberId: string) {
  return memberDayEvents(input, day, memberId)
    .sort(
      (a, b) =>
        Number(eventDisplay(b, input).allDay) - Number(eventDisplay(a, input).allDay) ||
        String(a.data.start).localeCompare(String(b.data.start)) ||
        a.id.localeCompare(b.id),
    )
    .map((record) => calendarPrintEntry(record, input));
}

export function calendarPrintEntry(record: DomainRecord, input: ExportInput) {
  const display = eventDisplay(record, input);
  const original = /^#[0-9a-f]{6}$/i.test(display.color) ? display.color : "#77818e";
  // Absences remain lighter, but the entire printed entry carries its colour.
  const color = display.allDay
    ? `#${[1, 3, 5]
        .map((index) =>
          Math.round((parseInt(original.slice(index, index + 2), 16) + 255) / 2)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`
    : original;
  const paint = calendarEventPaint(color, false);
  return {
    id: record.id,
    title: display.title,
    time: display.allDay ? "" : eventTimeLabel(record, input),
    color,
    textColor: paint.textColor,
  };
}
