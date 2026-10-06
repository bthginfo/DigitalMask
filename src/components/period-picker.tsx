"use client";
import { useId, useMemo, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { instantDate, timeAllocations, weekStart } from "@/shared/client-api";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateMatchesPeriod,
  periodOptions,
  recordMatchesPeriod,
  seasonBounds,
  seasonForDate,
  seasonKey,
  type PeriodFilter,
} from "@/shared/period-filter";
import { numberDraft, previewNumberDraft } from "@/shared/number-draft";
import styles from "./period-picker.module.css";
export function PeriodPicker({
  records,
  productions,
  value,
  onChange,
  season = true,
  compact = false,
}: {
  records: DomainRecord[];
  productions: DomainRecord[];
  value: PeriodFilter;
  onChange: (filter: PeriodFilter) => void;
  season?: boolean;
  compact?: boolean;
}) {
  const listId = useId();
  const controlsId = useId();
  const [expanded, setExpanded] = useState(false);
  const year = numberDraft(value.year);
  const [yearEdit, setYearEdit] = useState({ base: year, text: year });
  const yearDraft = yearEdit.base === year ? yearEdit.text : year;
  const currentSeason = seasonForDate(productions);
  const isCurrent =
    !value.year && !!value.season && seasonKey(value.season) === seasonKey(currentSeason);
  const options = useMemo(() => {
    const next = periodOptions(records, productions);
    if (value.season && !next.seasons.includes(value.season)) next.seasons.unshift(value.season);
    if (season && !next.seasons.some((label) => seasonKey(label) === seasonKey(currentSeason)))
      next.seasons.unshift(currentSeason);
    return next;
  }, [records, productions, value.season, season, currentSeason]);
  const count = useMemo(
    () => records.filter((record) => recordMatchesPeriod(record, value, productions)).length,
    [records, productions, value],
  );
  const returnCurrent = () => {
    setYearEdit({ base: year, text: "" });
    onChange({ season: currentSeason });
  };
  return (
    <div className={`period-picker ${styles.root}${compact ? " period-picker--compact" : ""}`}>
      <div className={styles.mobileSummary}>
        <button
          type="button"
          className={styles.summaryButton}
          aria-label="Zeitraum auswählen"
          aria-expanded={expanded}
          aria-controls={controlsId}
          onClick={() => setExpanded((open) => !open)}
        >
          <CalendarDays size={17} />
          <span>
            <strong>
              {season && value.season
                ? `Spielzeit ${value.season}${value.year ? ` · ${value.year}` : ""}`
                : value.year
                  ? `Jahr ${value.year}`
                  : season
                    ? "Alle Spielzeiten"
                    : "Alle Jahre"}
            </strong>
            <small>
              {isCurrent ? "Aktuell · " : ""}
              {count} {count === 1 ? "Eintrag" : "Einträge"}
              {expanded ? " · Filter schließen" : " · Filter ändern"}
            </small>
          </span>
          <ChevronDown size={16} className={expanded ? styles.chevronOpen : ""} />
        </button>
        {season && !isCurrent && (
          <button
            type="button"
            className={styles.currentButton}
            aria-label="Aktuelle Spielzeit anzeigen"
            onClick={returnCurrent}
          >
            Aktuell
          </button>
        )}
      </div>
      <div id={controlsId} className={`${styles.controls} ${expanded ? styles.expanded : ""}`}>
        <label>
          Jahr
          <input
            type="number"
            min={1900}
            max={2100}
            list={listId}
            placeholder="Alle Jahre"
            value={yearDraft}
            onChange={(event) => {
              const text = event.target.value;
              setYearEdit({ base: year, text });
              const parsed = previewNumberDraft(text, { min: 1900, max: 2100, integer: true });
              if (!text || parsed !== undefined) onChange({ ...value, year: parsed });
            }}
          />
          <datalist id={listId}>
            {options.years.map((year) => (
              <option value={year} key={year} />
            ))}
          </datalist>
        </label>
        {season && (
          <label>
            Spielzeit
            <select
              aria-label="Spielzeit"
              value={value.season || ""}
              onChange={(event) => onChange({ ...value, season: event.target.value || undefined })}
            >
              <option value="">Alle Spielzeiten</option>
              {options.seasons.map((season) => (
                <option value={season} key={season}>
                  {season}
                </option>
              ))}
            </select>
          </label>
        )}
        {(yearDraft || value.season) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setYearEdit({ base: year, text: "" });
              onChange({});
            }}
          >
            Zeitraum zurücksetzen
          </button>
        )}
        {season && !isCurrent && (
          <button
            type="button"
            className={`text-button ${styles.desktopCurrent}`}
            onClick={returnCurrent}
          >
            Aktuelle Spielzeit
          </button>
        )}
      </div>
    </div>
  );
}
export const periodExportFilters = (value: PeriodFilter) => ({
  ...(value.year ? { year: String(value.year) } : {}),
  ...(value.season ? { season: value.season } : {}),
});

export function weekForPeriod(
  records: DomainRecord[],
  personId: string,
  period: PeriodFilter,
  currentWeek: string,
) {
  if (!period.year && !period.season) return currentWeek;
  if (dateMatchesPeriod(currentWeek, period)) return currentWeek;
  const date =
    records
      .filter((row) => row.data.userId === personId)
      .flatMap((row) => timeAllocations(row.data))
      .find((day) => dateMatchesPeriod(day.date, period))?.date ||
    (period.year ? period.year + "-01-04" : seasonBounds(period.season)?.from);
  if (!date) return currentWeek;
  return weekStart(instantDate(date));
}
