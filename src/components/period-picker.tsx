"use client";
import { useId, useState } from "react";
import { instantDate, timeAllocations, weekStart } from "@/shared/client-api";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateMatchesPeriod,
  periodOptions,
  seasonBounds,
  type PeriodFilter,
} from "@/shared/period-filter";
import { numberDraft, previewNumberDraft } from "@/shared/number-draft";
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
  const year = numberDraft(value.year);
  const [yearEdit, setYearEdit] = useState({ base: year, text: year });
  const yearDraft = yearEdit.base === year ? yearEdit.text : year;
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
