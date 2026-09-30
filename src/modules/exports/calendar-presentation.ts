import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { calendarPresentation } from "../../shared/calendar-categories";
import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

export function eventDisplay(record: DomainRecord, input: ExportInput) {
  return calendarPresentation(
    record,
    input.references?.productions ?? [],
    input.references?.calendarCategories ?? [],
  );
}
export function allDayInterval(record: DomainRecord): { start: Date; end: Date; days: number } {
  const originalStart = new Date(String(record.data.start)),
    originalEnd = new Date(String(record.data.end));
  if (
    !Number.isFinite(+originalStart) ||
    !Number.isFinite(+originalEnd) ||
    originalEnd <= originalStart
  )
    throw new Error("Ein ganztägiger Kalendereintrag hat ungültige Datumsangaben.");
  const startDay = formatInTimeZone(originalStart, "Europe/Berlin", "yyyy-MM-dd");
  let endDay = formatInTimeZone(originalEnd, "Europe/Berlin", "yyyy-MM-dd");
  if (formatInTimeZone(originalEnd, "Europe/Berlin", "HH:mm:ss.SSS") !== "00:00:00.000")
    endDay = format(addDays(parseISO(endDay), 1), "yyyy-MM-dd");
  const days = Math.max(1, differenceInCalendarDays(parseISO(endDay), parseISO(startDay)));
  return {
    start: fromZonedTime(`${startDay}T00:00:00`, "Europe/Berlin"),
    end: fromZonedTime(
      `${format(addDays(parseISO(startDay), days), "yyyy-MM-dd")}T00:00:00`,
      "Europe/Berlin",
    ),
    days,
  };
}
