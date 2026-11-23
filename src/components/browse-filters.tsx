"use client";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { PeriodFilter } from "@/shared/period-filter";
import styles from "./browse-filters.module.css";

export function BrowseFilters({
  label,
  placeholder,
  search,
  onSearch,
  period,
  selection,
  children,
}: {
  label: string;
  placeholder: string;
  search: string;
  onSearch: (value: string) => void;
  period: PeriodFilter;
  selection?: string;
  children: ReactNode;
}) {
  const summary = [
    period.season ? `Spielzeit ${period.season}` : "Alle Spielzeiten",
    period.year,
    selection,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={styles.tools}>
      <label className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          enterKeyHint="search"
          aria-label={label}
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <details className={styles.filters}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Filter
          <span>{summary}</span>
          <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
        </summary>
        <div className={styles.fields}>{children}</div>
      </details>
    </div>
  );
}
