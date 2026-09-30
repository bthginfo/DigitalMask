"use client";
import { useId } from "react";
import { instantDate, timeAllocations, weekStart } from "@/shared/client-api";
import type { DomainRecord } from "@/shared/contracts";
import { periodOptions, type PeriodFilter } from "@/shared/period-filter";
export function PeriodPicker({
  records,
  productions,
  value,
  onChange,
  season = true,
}: {
  records: DomainRecord[];
  productions: DomainRecord[];
  value: PeriodFilter;
  onChange: (filter: PeriodFilter) => void;
  season?: boolean;
}) {
  const listId = useId();
  const options = periodOptions(records, productions);
  return (
    <div className="period-picker">
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
  if (!period.year) return currentWeek;
  const date =
    records
      .filter((row) => row.data.userId === personId)
      .flatMap((row) => timeAllocations(row.data))
      .find((day) => Number(day.date.slice(0, 4)) === period.year)?.date || period.year + "-01-04";
  return weekStart(instantDate(date));
}
