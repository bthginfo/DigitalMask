import { textValue, type DomainRecord, type RecordData } from "./contracts";

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

/** Keep one identity for equivalent labels such as 2026/27 and 2026 / 2027. */
export function seasonKey(value: unknown) {
  const bounds = seasonBounds(textValue(value).trim());
  return bounds ? `${bounds.from.slice(0, 4)}/${bounds.to.slice(0, 4)}` : undefined;
}

/** Global views start current; an opened historical production keeps its own context. */
export function initialPeriod(productions: DomainRecord[] = [], productionId = ""): PeriodFilter {
  const production = productions.find((row) => row.id === productionId);
  return { season: textValue(production?.data.season) || seasonForDate(productions) };
}

/** Missing legacy membership means today's initial catalogue, while [] is an explicit removal. */
export function actorSeasons(data: RecordData, fallback = seasonForDate()) {
  const values = Array.isArray(data.ensembleSeasons) ? data.ensembleSeasons : [fallback];
  return [...new Set(values.map(seasonKey).filter((value): value is string => !!value))];
}

export function withEnsembleSeason(data: RecordData, season: string): string[] {
  const key = seasonKey(season);
  if (!key) throw new Error("Bitte eine gültige Spielzeit auswählen, zum Beispiel 2026/2027.");
  return [
    ...new Set([...actorSeasons(data, Object.hasOwn(data, "name") ? seasonForDate() : key), key]),
  ].sort((a, b) => b.localeCompare(a));
}

export function teamTaskSeason(data: RecordData, createdAt: string) {
  const explicit = seasonKey(data.season);
  if (explicit) return explicit;
  const due = new Date(textValue(data.due));
  const date = Number.isFinite(due.getTime()) ? due : new Date(createdAt);
  return Number.isFinite(date.getTime()) ? seasonForDate([], date) : undefined;
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
  if (record.kind === "actors") {
    const seasons = actorSeasons(record.data);
    const selected = seasonKey(filter.season);
    if (!filter.season && !filter.year) return true;
    return seasons.some((season) => {
      const bounds = seasonBounds(season)!;
      return (
        (!filter.season || season === selected) &&
        (!filter.year ||
          filter.year === Number(bounds.from.slice(0, 4)) ||
          filter.year === Number(bounds.to.slice(0, 4)))
      );
    });
  }
  const production =
    record.kind === "productions"
      ? record
      : productions.find((row) => row.id === record.data.productionId);
  // General team documents remain available alongside season-specific productions.
  const dated = ["time", "attendance", "events", "leave"].includes(record.kind);
  if (filter.season && record.kind === "tasks" && !record.data.productionId) {
    if (teamTaskSeason(record.data, record.createdAt) !== seasonKey(filter.season)) return false;
  }
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
  const seasonLabels = new Map<string, string>();
  const addSeason = (label: string) => {
    const key = seasonKey(label) || label;
    if (key && !seasonLabels.has(key)) seasonLabels.set(key, label);
  };
  productions.forEach((row) => addSeason(textValue(row.data.season)));
  records.forEach((record) => {
    if (record.kind === "actors") actorSeasons(record.data).forEach(addSeason);
    else if (record.kind === "tasks" && !record.data.productionId)
      addSeason(teamTaskSeason(record.data, record.createdAt) || "");
  });
  return {
    years: Array.from(
      new Set(
        records
          .flatMap((record) =>
            record.kind === "actors"
              ? actorSeasons(record.data).flatMap((season) => {
                  const bounds = seasonBounds(season)!;
                  return [Number(bounds.from.slice(0, 4)), Number(bounds.to.slice(0, 4))];
                })
              : [recordYear(record, productions)],
          )
          .filter((year): year is number => !!year),
      ),
    ).sort((a, b) => b - a),
    seasons: Array.from(seasonLabels.values()).sort((a, b) => b.localeCompare(a, "de")),
  };
}
