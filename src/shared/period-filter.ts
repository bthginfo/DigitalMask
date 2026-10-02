import { textValue, type DomainRecord } from "./contracts";

export interface PeriodFilter {
  year?: number;
  season?: string;
}
/** The theatre season spans August through July, independent of calendar years. */
export function seasonBounds(season?: string) {
  const match = season?.match(/^(\d{4})\s*[\/–—-]\s*(\d{2}|\d{4})$/);
  if (!match) return;
  const start = Number(match[1]);
  const end =
    match[2].length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) : Number(match[2]);
  if (end !== start + 1) return;
  return { from: `${start}-08-01`, to: `${end}-08-01` };
}

export function seasonForDate(productions: DomainRecord[] = [], date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const start = year - (month < 8 ? 1 : 0);
  return (
    productions
      .map((row) => textValue(row.data.season))
      .find((season) => seasonBounds(season)?.from === `${start}-08-01`) || `${start}/${start + 1}`
  );
}

export function dateMatchesPeriod(date: string, filter: PeriodFilter) {
  const bounds = seasonBounds(filter.season);
  return (
    (!filter.year || yearOf(date) === filter.year) &&
    (!bounds || (date >= bounds.from && date < bounds.to))
  );
}
const yearOf = (value: unknown) => {
  const match = typeof value === "string" ? value.match(/^(\d{4})/) : null;
  return match ? Number(match[1]) : undefined;
};

/** Period choices reuse workspace data. A production's saved season is authoritative. */
export function recordYear(record: DomainRecord, productions: DomainRecord[] = []) {
  if (["time", "attendance", "events", "leave"].includes(record.kind))
    return yearOf(record.data.date || record.data.start) || yearOf(record.createdAt);
  const production =
    record.kind === "productions"
      ? record
      : productions.find((row) => row.id === record.data.productionId);
  return (
    yearOf(production?.data.premiere) ||
    yearOf(production?.data.season) ||
    yearOf(record.data.due) ||
    yearOf(record.createdAt)
  );
}

export function recordMatchesPeriod(
  record: DomainRecord,
  filter: PeriodFilter,
  productions: DomainRecord[] = [],
) {
  const production =
    record.kind === "productions"
      ? record
      : productions.find((row) => row.id === record.data.productionId);
  // General team documents remain available alongside season-specific productions.
  const dated = ["time", "attendance", "events", "leave"].includes(record.kind);
  if (filter.season && production && !dated) {
    const assignedSeason = textValue(production.data.season);
    const selectedBounds = seasonBounds(filter.season);
    const assignedBounds = seasonBounds(assignedSeason);
    if (
      assignedSeason !== filter.season &&
      !(selectedBounds && assignedBounds && selectedBounds.from === assignedBounds.from)
    )
      return false;
  }
  if (dated && filter.season && seasonBounds(filter.season)) {
    const bounds = seasonBounds(filter.season)!;
    if (["time", "attendance"].includes(record.kind) && Array.isArray(record.data.dayAllocations)) {
      return record.data.dayAllocations.some((item) =>
        dateMatchesPeriod(String((item as { date?: string }).date || ""), filter),
      );
    }
    const start = textValue(record.data.date || record.data.start).slice(0, 10);
    const end = textValue(
      record.kind === "events" && record.data.recurrence && record.data.recurrence !== "none"
        ? record.data.until || "9999-12-31"
        : record.data.end || start,
    ).slice(0, 10);
    if (!start || start >= bounds.to || end < bounds.from) return false;
  }
  if (!filter.year) return true;
  if (["time", "attendance"].includes(record.kind) && Array.isArray(record.data.dayAllocations))
    return record.data.dayAllocations.some(
      (item) => yearOf((item as { date?: string }).date) === filter.year,
    );
  if (record.kind === "events" && record.data.recurrence && record.data.recurrence !== "none") {
    const start = yearOf(record.data.start);
    const until = yearOf(record.data.until);
    return !!start && filter.year >= start && (!until || filter.year <= until);
  }
  return recordYear(record, productions) === filter.year;
}

export function periodOptions(records: DomainRecord[], productions: DomainRecord[] = []) {
  return {
    years: Array.from(
      new Set(
        records
          .map((record) => recordYear(record, productions))
          .filter((year): year is number => !!year),
      ),
    ).sort((a, b) => b - a),
    seasons: Array.from(
      new Set(productions.map((row) => textValue(row.data.season)).filter(Boolean)),
    ).sort((a, b) => b.localeCompare(a, "de")),
  };
}
