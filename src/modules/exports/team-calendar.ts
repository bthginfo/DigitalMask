import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { defaultCalendarCategories } from "../../shared/calendar-categories";
import { listValue, type DomainRecord } from "../../shared/contracts";
import { calendarRange, localDay } from "./calendar";
import { eventDisplay } from "./calendar-presentation";
import type { ExportInput } from "./types";

export function teamCalendarMembers(input: ExportInput): { id: string; name: string }[] {
  const members = input.members.filter(
    (member) =>
      member.status === "active" &&
      member.role !== "superadmin" &&
      (input.userIds === undefined || input.userIds.includes(member.id)),
  );
  return input.records.some(
    (record) => record.kind === "events" && !listValue(record.data.participantIds).length,
  )
    ? [...members, { id: "", name: "Ohne Zuordnung" }]
    : members;
}
export function teamCalendarWeeks(input: ExportInput) {
  const range = calendarRange(input),
    weeks: { key: string; label: string; days: string[] }[] = [];
  for (
    let day = startOfWeek(parseISO(range.from), { weekStartsOn: 1 });
    day <= parseISO(range.to);
    day = addDays(day, 7)
  )
    weeks.push({
      key: format(day, "yyyy-MM-dd"),
      label: `${format(day, "MMMM yyyy", { locale: de })} · KW ${format(day, "II")}`,
      days: Array.from({ length: 7 }, (_, i) => format(addDays(day, i), "yyyy-MM-dd")),
    });
  return weeks;
}
export function memberDayEvents(input: ExportInput, day: string, memberId: string) {
  const range = calendarRange(input);
  if (day < range.from || day > range.to) return [];
  return input.records.filter((record) => {
    if (record.kind !== "events") return false;
    const participants = listValue(record.data.participantIds);
    if (memberId ? !participants.includes(memberId) : participants.length) return false;
    return (
      localDay(new Date(String(record.data.start))) <= day &&
      localDay(new Date(+new Date(String(record.data.end)) - 1)) >= day
    );
  });
}
export function eventTimeLabel(record: DomainRecord, input: ExportInput): string {
  if (eventDisplay(record, input).allDay) return "Ganztägig";
  return `${formatInTimeZone(new Date(String(record.data.start)), "Europe/Berlin", "HH:mm")} – ${formatInTimeZone(new Date(String(record.data.end)), "Europe/Berlin", "HH:mm")}`;
}
export function eventCalendarLabel(record: DomainRecord, input: ExportInput): string {
  const display = eventDisplay(record, input);
  return `${eventTimeLabel(record, input)} · ${display.title} · ${display.categoryName}`;
}
export function calendarLegend(input: ExportInput) {
  const eventKeys = [
    ...new Set(
      input.records
        .filter((record) => record.kind === "events")
        .map((record) => String(record.data.category || "service")),
    ),
  ];
  const keys = eventKeys.length
    ? eventKeys
    : [
        ...new Set([
          ...defaultCalendarCategories.map((category) => category.key),
          ...(input.references?.calendarCategories ?? []).map((category) =>
            String(category.data.key),
          ),
        ]),
      ];
  return keys.map((key) =>
    eventDisplay(
      {
        id: `legend-${key}`,
        kind: "events",
        organizationId: "",
        departmentId: "",
        createdBy: "",
        createdAt: "",
        updatedAt: "",
        version: 1,
        data: { category: key },
      },
      input,
    ),
  );
}
