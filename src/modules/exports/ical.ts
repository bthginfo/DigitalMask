import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { dateValue, readable, value } from "./data";
import type { ExportInput } from "./types";
import { allDayInterval, eventDisplay } from "./calendar-presentation";

export function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
/** RFC 5545 physical lines: max 75 octets, never split a UTF-8 codepoint. */
export function foldIcs(line: string): string {
  let output = "",
    current = "",
    size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (size + bytes > 75) {
      output += `${current}\r\n`;
      current = " ";
      size = 1;
    }
    current += character;
    size += bytes;
  }
  return output + current;
}
const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function buildIcs(input: ExportInput): Uint8Array {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DigitalMask//Kalender DE//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`${input.department} · ${input.organization}`)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const record of input.records.filter((r) => r.kind === "events")) {
    const display = eventDisplay(record, input);
    const interval = display.allDay ? allDayInterval(record) : undefined;
    const start = interval?.start ?? dateValue(value(record, "start", "startAt")),
      end = interval?.end ?? dateValue(value(record, "end", "endAt"));
    if (!start || !end)
      throw new Error("Kalenderexport enthält einen Termin ohne gültigen Beginn oder Ende.");
    const recurring = ["daily", "weekly"].includes(readable(value(record, "recurrence")));
    const allDay = display.allDay;
    const dateLine = (key: string, date: Date) =>
      allDay
        ? `${key};VALUE=DATE:${formatInTimeZone(date, "Europe/Berlin", "yyyyMMdd")}`
        : recurring
          ? `${key};TZID=Europe/Berlin:${formatInTimeZone(date, "Europe/Berlin", "yyyyMMdd'T'HHmmss")}`
          : `${key}:${utc(date)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(record.id)}@digitalmask`,
      `DTSTAMP:${utc(dateValue(record.updatedAt) ?? start)}`,
      dateLine("DTSTART", start),
      dateLine("DTEND", end),
      `SUMMARY:${escapeIcs(display.title)}`,
    );
    const people = Array.isArray(record.data.participantIds)
      ? record.data.participantIds
          .map((id) => input.members.find((m) => m.id === id)?.name ?? "")
          .filter(Boolean)
          .join(", ")
      : "";
    const description = [
      readable(value(record, "description", "notes")),
      people ? `Personen: ${people}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    if (record.data.location) lines.push(`LOCATION:${escapeIcs(readable(record.data.location))}`);
    lines.push(`CATEGORIES:${escapeIcs(display.categoryName)}`);
    lines.push(`TRANSP:${display.blocksTime ? "OPAQUE" : "TRANSPARENT"}`);
    if (recurring) {
      const until =
        typeof record.data.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.data.until)
          ? fromZonedTime(`${record.data.until}T23:59:59`, "Europe/Berlin")
          : undefined;
      const untilValue = until
        ? allDay
          ? String(record.data.until).replace(/-/g, "")
          : utc(until)
        : "";
      lines.push(
        `RRULE:FREQ=${String(record.data.recurrence).toUpperCase()}${untilValue ? `;UNTIL=${untilValue}` : ""}`,
      );
      const exceptions = Array.isArray(record.data.exceptions)
        ? record.data.exceptions.filter(
            (x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x),
          )
        : [];
      if (exceptions.length) {
        const clock = formatInTimeZone(start, "Europe/Berlin", "HHmmss");
        lines.push(
          allDay
            ? `EXDATE;VALUE=DATE:${exceptions.map((d) => d.replace(/-/g, "")).join(",")}`
            : `EXDATE;TZID=Europe/Berlin:${exceptions.map((d) => `${d.replace(/-/g, "")}T${clock}`).join(",")}`,
        );
      }
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new TextEncoder().encode(lines.map(foldIcs).join("\r\n") + "\r\n");
}
