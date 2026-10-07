"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Button } from "@/components/ui";
import { dateLabel, hours, localDate, shiftDate, weekStart } from "@/shared/client-api";
import { calculateAttendanceBalance, signedHours } from "../balance";
import { isoWeek } from "../history";
import styles from "./attendance-balance.module.css";

type BalancePeriod = "total" | "week" | "month" | "custom";
export function AttendanceBalanceCard({
  person,
  compact = false,
  onOpenSettings,
  selectedWeek,
  onWeekChange,
}: {
  person?: string;
  compact?: boolean;
  onOpenSettings?: () => void;
  selectedWeek?: string;
  onWeekChange?: (week: string) => void;
}) {
  const { workspace } = useWorkspace();
  const selected = person || workspace.user.id;
  const member =
    selected === workspace.user.id
      ? workspace.user
      : workspace.members.find((row) => row.id === selected);
  const settings = member?.preferences?.workingTime;
  const [period, setPeriod] = useState<BalancePeriod>("total");
  const [ownWeek, setOwnWeek] = useState(weekStart());
  const week = selectedWeek || ownWeek;
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [from, setFrom] = useState(`${localDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(localDate());
  const today = localDate();
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const monthEnd = validMonth
    ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
        .toISOString()
        .slice(0, 10)
    : today;
  const range =
    period === "week"
      ? { from: week, to: shiftDate(week, 6) }
      : period === "month"
        ? { from: `${validMonth ? month : today.slice(0, 7)}-01`, to: monthEnd }
        : period === "custom"
          ? { from, to }
          : {};
  const invalidRange =
    period === "custom" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to);
  const balance =
    settings && !invalidRange
      ? calculateAttendanceBalance({
          userId: selected,
          settings,
          attendance: workspace.records.attendance,
          events: workspace.records.events,
          calendarCategories: workspace.records.calendarCategories,
          leave: workspace.records.leave,
          ...range,
          includeOpeningBalance: period === "total",
        })
      : undefined;
  const seconds = balance?.balanceSeconds || 0;
  const status = seconds > 0 ? "Plusstunden" : seconds < 0 ? "Minusstunden" : "Ausgeglichen";
  const tone = seconds > 0 ? styles.positive : seconds < 0 ? styles.negative : "";
  const breakdown = balance && (
    <dl className={styles.breakdown}>
      <div>
        <dt>Anwesenheit</dt>
        <dd>{hours(balance.attendanceSeconds)} h</dd>
      </div>
      <div>
        <dt>Urlaub / Krank</dt>
        <dd>{hours(balance.creditSeconds)} h</dd>
      </div>
      <div>
        <dt>Sollzeit</dt>
        <dd>{hours(balance.targetSeconds)} h</dd>
      </div>
      {period === "total" && (
        <div>
          <dt>Startsaldo</dt>
          <dd>{signedHours(balance.openingBalanceSeconds)} h</dd>
        </div>
      )}
    </dl>
  );
  return (
    <section
      className={`${styles.card} ${compact ? styles.compact : styles.panel}`}
      aria-label={`Zeitkonto von ${member?.name || "Teammitglied"}`}
    >
      <header className={styles.header}>
        <span className={styles.heading}>
          <Scale size={17} />
          Zeitkonto{!compact && member ? ` · ${member.name}` : ""}
        </span>
        {settings && (
          <select
            aria-label="Zeitraum des Zeitkontos"
            value={period}
            onChange={(event) => setPeriod(event.target.value as BalancePeriod)}
          >
            <option value="total">Gesamt</option>
            <option value="week">Woche</option>
            <option value="month">Monat</option>
            <option value="custom">Zeitraum</option>
          </select>
        )}
      </header>
      {!settings ? (
        <div className={styles.unconfigured}>
          <strong>Wochenstunden fehlen</strong>
          <p>Lege Wochenstunden und Beginn fest, damit dein Plus / Minus berechnet wird.</p>
          {onOpenSettings ? (
            <Button onClick={onOpenSettings}>
              Wochenstunden festlegen <ArrowRight size={14} />
            </Button>
          ) : (
            <Link href="/?module=settings">
              In Einstellungen festlegen <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : (
        <>
          {period === "week" && (
            <label className={styles.datePicker}>
              Woche ab
              <input
                type="date"
                aria-label="Woche für Zeitkonto"
                value={week}
                onChange={(event) => {
                  if (event.target.value) {
                    const next = isoWeek(event.target.value).start;
                    if (onWeekChange) onWeekChange(next);
                    else setOwnWeek(next);
                  }
                }}
              />
            </label>
          )}
          {period === "month" && (
            <label className={styles.datePicker}>
              Monat
              <input
                type="month"
                aria-label="Monat für Zeitkonto"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </label>
          )}
          {period === "custom" && (
            <div className={styles.dates}>
              <label>
                Von
                <input
                  type="date"
                  aria-label="Zeitkonto von"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                Bis
                <input
                  type="date"
                  aria-label="Zeitkonto bis"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>
          )}
          {invalidRange ? (
            <p className="error-message">Bitte prüfe Beginn und Ende des Zeitraums.</p>
          ) : (
            balance && (
              <>
                <div className={`${styles.total} ${tone}`} aria-live="polite">
                  <strong className={styles.value}>
                    {signedHours(seconds)} <small>h</small>
                  </strong>
                  <span>
                    {status}
                    {period === "total" ? " gesamt" : " im Zeitraum"}
                  </span>
                </div>
                <p className={styles.range}>
                  {balance.from > balance.to
                    ? `Beginnt am ${dateLabel(balance.from)}`
                    : `${dateLabel(balance.from)} – ${dateLabel(balance.to)}`}
                </p>
                {compact ? (
                  <details className={styles.details}>
                    <summary>Berechnung anzeigen</summary>
                    {breakdown}
                    <p>Nur gespeicherte Anwesenheit; Sollzeit zählt bis heute.</p>
                  </details>
                ) : (
                  <>
                    {breakdown}
                    <p className="small muted">
                      Sollzeiten zählen bis einschließlich heute. Urlaub und Krank füllen höchstens
                      die noch fehlende Tages-Sollzeit auf; Anwesenheit wird dabei nicht doppelt
                      gezählt.
                    </p>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}

export { styles as attendanceBalanceStyles };
