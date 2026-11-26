import { listValue, textValue, type RecordData } from "@/shared/contracts";

/** Duty notices for one person within this window are merged into one summary and one push. */
export const dutyNoticeWindowMs = 10 * 60_000;
/** Beyond this many merged events, a new notice starts instead of an ever-growing summary. */
export const dutyNoticeMaxSources = 200;
const storedEntries = 50;
const listedEntries = 3;

export type DutyEntry = {
  title: string;
  start: string;
  allDay: boolean;
  change: "new" | "changed";
};

const dutyDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const dutyTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

export function dutyEntry(payload: RecordData): DutyEntry {
  return {
    title: textValue(payload.body) || "Dienst",
    start: textValue(payload.start),
    allDay: payload.allDay === true,
    change: payload.title === "Neuer Dienst" ? "new" : "changed",
  };
}

/** Notices written before coalescing existed still describe exactly one event. */
export function dutyEntries(data: RecordData): DutyEntry[] {
  if (Array.isArray(data.entries))
    return data.entries.filter(
      (entry): entry is DutyEntry =>
        !!entry && typeof entry === "object" && typeof (entry as DutyEntry).title === "string",
    );
  return [dutyEntry(data)];
}
export function dutySources(id: string, data: RecordData) {
  const stored = listValue(data.sourceEventIds);
  if (stored.length) return stored;
  // notice:<outbox event id>:<user id>
  const [, eventId] = id.split(":");
  return eventId ? [eventId] : [];
}

function describe(entry: DutyEntry) {
  const date = new Date(entry.start);
  if (!entry.start || !Number.isFinite(date.getTime())) return entry.title;
  const day = dutyDate.format(date);
  return `${entry.title} · ${entry.allDay ? day : `${day}, ${dutyTime.format(date)}`}`;
}

/** One unread duty notice for several events: "3 neue Dienste" or "Dienstplan geändert". */
export function dutySummary(entries: DutyEntry[], count: number) {
  const ordered = [...entries].sort(
    (a, b) =>
      (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0) || a.title.localeCompare(b.title),
  );
  const listed = ordered.slice(0, listedEntries).map(describe).join("; ");
  return {
    title: entries.every((entry) => entry.change === "new")
      ? `${count} neue Dienste`
      : "Dienstplan geändert",
    body: count > listedEntries ? `${listed} …` : listed,
  };
}

/** Merge one more event into an unread duty notice; idempotent per outbox event. */
export function mergeDutyNotice(
  notice: { id: string; data: RecordData },
  eventId: string,
  payload: RecordData,
): RecordData | undefined {
  const sources = dutySources(notice.id, notice.data);
  if (sources.includes(eventId)) return undefined;
  const nextSources = [...sources, eventId];
  const entries = [...dutyEntries(notice.data), dutyEntry(payload)].slice(-storedEntries);
  return {
    ...notice.data,
    ...dutySummary(entries, nextSources.length),
    // A summary opens the calendar, not one of its events.
    recordId: "",
    productionId: "",
    entries,
    sourceEventIds: nextSources,
    read: false,
  };
}
