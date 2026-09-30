import { textValue, type DomainRecord } from "./contracts";

export interface PeriodFilter {
  year?: number;
  season?: string;
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
  if (filter.season && production && textValue(production.data.season) !== filter.season)
    return false;
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
