"use client";
import { Plus, X } from "lucide-react";
import { normalizeSeasonList, shiftSeason, shortSeasonLabel } from "@/shared/period-filter";
import styles from "./production-seasons-field.module.css";

/** Repertoire: one production, any number of seasons. Values are normalised season keys. */
export function ProductionSeasonsField({
  seasons,
  current,
  legacy = "",
  onChange,
}: {
  seasons: string[];
  current: string;
  legacy?: string;
  onChange: (seasons: string[]) => void;
}) {
  const add = (season?: string) => {
    if (season) onChange(normalizeSeasonList([...seasons, season]));
  };
  const remove = (season: string) => onChange(seasons.filter((value) => value !== season));
  const suggestions = normalizeSeasonList(
    seasons.length
      ? [shiftSeason(seasons[0], -1), current, shiftSeason(seasons[seasons.length - 1], 1)]
      : [shiftSeason(current, -1), current, shiftSeason(current, 1)],
  ).filter((season) => !seasons.includes(season));
  const others = Array.from({ length: 16 }, (_, index) => shiftSeason(current, 3 - index)).filter(
    (season): season is string => !!season && !seasons.includes(season),
  );
  const label = (season: string) =>
    `${shortSeasonLabel(season)}${season === current ? " · aktuell" : ""}`;
  return (
    <fieldset className={`field-wide ${styles.root}`}>
      <legend>Spielt in Spielzeiten</legend>
      {seasons.length ? (
        <ul className={styles.chips} aria-label="Ausgewählte Spielzeiten">
          {seasons.map((season) => (
            <li key={season} className={season === current ? styles.current : undefined}>
              <span>{label(season)}</span>
              <button
                type="button"
                aria-label={`Spielzeit ${shortSeasonLabel(season)} entfernen`}
                onClick={() => remove(season)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {legacy
            ? `Bisher eingetragen: „${legacy}“. Wähle die passende Spielzeit.`
            : "Noch keine Spielzeit. Das Stück erscheint dann nur unter Alle Spielzeiten."}
        </p>
      )}
      <div className={styles.add}>
        {suggestions.map((season) => (
          <button
            type="button"
            key={season}
            className={styles.suggestion}
            aria-label={`Spielzeit ${shortSeasonLabel(season)} hinzufügen`}
            onClick={() => add(season)}
          >
            <Plus size={15} aria-hidden="true" />
            {label(season)}
          </button>
        ))}
        <select
          className={styles.more}
          aria-label="Andere Spielzeit hinzufügen"
          value=""
          onChange={(event) => add(event.target.value)}
        >
          <option value="">Andere …</option>
          {others.map((season) => (
            <option key={season} value={season}>
              {label(season)}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted">
        Das Stück erscheint mit Aufschrieben, Aufgaben und Maskenplänen in jeder gewählten
        Spielzeit. Die früheste gilt als Premierenspielzeit.
      </p>
    </fieldset>
  );
}
