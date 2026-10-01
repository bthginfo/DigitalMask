"use client";
import { useId } from "react";
import { instantDate, timeAllocations, weekStart } from "@/shared/client-api";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateMatchesPeriod,
  periodOptions,
  seasonBounds,
  type PeriodFilter,
} from "@/shared/period-filter";
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
  const options = periodOptions(records, productions);
  if (value.season && !options.seasons.includes(value.season))
    options.seasons.unshift(value.season);
  return (
    <div className={`period-picker${compact ? " period-picker--compact" : ""}`}>
      <label>
        Jahr
        <input
          type="number"
          min={1900}
          max={2100}
          list={listId}
          placeholder="Alle Jahre"
          value={value.year || ""}
          onChange={(event) =>
            onChange({
              ...value,
              year: event.target.value ? Number(event.target.value) : undefined,
            })
          }
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
      {(value.year || value.season) && (
        <button type="button" className="text-button" onClick={() => onChange({})}>
          Zeitraum zurücksetzen
        </button>
      )}
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
