import { createHash } from "node:crypto";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { calendarPresentation } from "@/shared/calendar-categories";
import { calendarEventSelected } from "@/shared/calendar-selection";
import { listValue, textValue, type DomainRecord } from "@/shared/contracts";
import { allDayInterval } from "@/modules/exports/calendar-presentation";
import type { GoogleCalendarSelection } from "./contracts";

export type GoogleEventBody = {
  summary: string;
  description: string;
  location: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  recurrence: string[];
  transparency: "opaque" | "transparent";
  visibility: "private";
  reminders: { useDefault: false };
  extendedProperties: { private: { digitalmask: string; source: string } };
};

export function matchesGoogleSelection(
  event: DomainRecord,
  selection: GoogleCalendarSelection,
  userId: string,
) {
  return (
    event.kind === "events" &&
    (!selection.productionId || event.data.productionId === selection.productionId) &&
    (!selection.category || event.data.category === selection.category) &&
    calendarEventSelected(
      event.data,
      selection.mode === "mine" ? [userId] : selection.memberIds,
      selection.mode === "team",
    )
  );
}

const utcRule = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildGoogleEvent(
  event: DomainRecord,
  connectionId: string,
  references: {
    productions: DomainRecord[];
    categories: DomainRecord[];
    members: { id: string; name: string }[];
  },
): GoogleEventBody {
  const display = calendarPresentation(event, references.productions, references.categories);
  const interval = display.allDay ? allDayInterval(event) : undefined;
  const start = interval?.start ?? new Date(String(event.data.start));
  const end = interval?.end ?? new Date(String(event.data.end));
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
    throw new Error("GoogleCalendarInvalidEventDates");
  const datePart = (date: Date) => formatInTimeZone(date, "Europe/Berlin", "yyyy-MM-dd");
  const recurrence: string[] = [];
  if (["daily", "weekly"].includes(textValue(event.data.recurrence))) {
    const until = textValue(event.data.until);
    const limit = /^\d{4}-\d{2}-\d{2}$/.test(until)
      ? display.allDay
        ? until.replace(/-/g, "")
        : utcRule(fromZonedTime(`${until}T23:59:59`, "Europe/Berlin"))
      : "";
    recurrence.push(
      `RRULE:FREQ=${textValue(event.data.recurrence).toUpperCase()}${limit ? `;UNTIL=${limit}` : ""}`,
    );
    const exceptions = listValue(event.data.exceptions).filter((day) =>
      /^\d{4}-\d{2}-\d{2}$/.test(day),
    );
    if (exceptions.length) {
      const clock = formatInTimeZone(start, "Europe/Berlin", "HHmmss");
      recurrence.push(
        display.allDay
          ? `EXDATE;VALUE=DATE:${exceptions.map((day) => day.replace(/-/g, "")).join(",")}`
          : `EXDATE;TZID=Europe/Berlin:${exceptions.map((day) => `${day.replace(/-/g, "")}T${clock}`).join(",")}`,
      );
    }
  }
  const people = listValue(event.data.participantIds)
    .map((id) => references.members.find((member) => member.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  // Google accepts HTML descriptions. Escaping keeps user-entered notes literal.
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  return {
    summary: display.title,
    description: [
      textValue(event.data.description) || textValue(event.data.notes),
      people ? `Personen: ${people}` : "",
      "In DigitalMask verwaltet. Änderungen bitte dort vornehmen.",
    ]
      .filter(Boolean)
      .map(escapeHtml)
      .join("\n"),
    location: textValue(event.data.location),
    start: display.allDay
      ? { date: datePart(start) }
      : { dateTime: start.toISOString(), timeZone: "Europe/Berlin" },
    end: display.allDay
      ? { date: datePart(end) }
      : { dateTime: end.toISOString(), timeZone: "Europe/Berlin" },
    recurrence,
    transparency: display.blocksTime ? "opaque" : "transparent",
    visibility: "private",
    reminders: { useDefault: false },
    extendedProperties: { private: { digitalmask: connectionId, source: event.id } },
  };
}

export const googleEventFingerprint = (body: GoogleEventBody) =>
  createHash("sha256").update(JSON.stringify(body)).digest("hex");

export function isManagedGoogleEvent(
  event: { extendedProperties?: { private?: Record<string, string> } },
  connectionId: string,
  recordId: string,
) {
  return (
    event.extendedProperties?.private?.digitalmask === connectionId &&
    event.extendedProperties.private.source === recordId
  );
}
