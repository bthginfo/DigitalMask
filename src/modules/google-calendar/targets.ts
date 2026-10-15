import type { GoogleCalendarSelection, GoogleCalendarTarget } from "./contracts";

/** Null preserves existing installations without rewriting IDs, tokens or mappings. */
export function googleConnectionTargets(row: {
  calendars: GoogleCalendarTarget[] | null;
  calendarId: string | null;
  calendarName: string | null;
  selection: GoogleCalendarSelection;
}): GoogleCalendarTarget[] {
  return (
    row.calendars ??
    (row.calendarId
      ? [
          {
            calendarId: row.calendarId,
            calendarName: row.calendarName || row.calendarId,
            selection: row.selection,
          },
        ]
      : [])
  );
}

export function replaceGoogleTarget(
  calendars: GoogleCalendarTarget[],
  previousCalendarId: string | undefined,
  target: GoogleCalendarTarget,
) {
  const same = calendars.findIndex((item) => item.calendarId === target.calendarId);
  const previous = calendars.findIndex((item) => item.calendarId === previousCalendarId);
  if (same >= 0 && same !== previous) throw new Error("GoogleCalendarDuplicateTarget");
  if (previousCalendarId && previous < 0) throw new Error("GoogleCalendarTargetChanged");
  if (previous >= 0) return calendars.map((item, index) => (index === previous ? target : item));
  if (calendars.length >= 20) throw new Error("GoogleCalendarTargetLimit");
  return [...calendars, target];
}
