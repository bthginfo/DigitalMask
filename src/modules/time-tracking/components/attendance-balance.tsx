"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Button } from "@/components/ui";
import {
  dateLabel,
  hours,
  instantDate,
  localDate,
  shiftDate,
  weekStart,
} from "@/shared/client-api";
import {
  attendanceMonthRange,
  calculateAttendanceBalance,
  signedHours,
  type AttendanceBalanceAmounts,
} from "../balance";
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
  const configured = Boolean(settings?.schedules.length);
  const [period, setPeriod] = useState<BalancePeriod>("total");
  const [ownWeek, setOwnWeek] = useState(weekStart());
  const week = selectedWeek || ownWeek;
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [from, setFrom] = useState(`${localDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(localDate());
  const today = localDate();
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const range: { from?: string; to?: string } =
    period === "week"
      ? { from: week, to: shiftDate(week, 6) }
      : period === "month"
        ? attendanceMonthRange(validMonth ? month : today.slice(0, 7))
        : period === "custom"
          ? { from, to }
          : {};
  const { from: rangeFrom, to: rangeTo } = range;
  const invalidRange =
    period === "custom" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to);
  const balance = useMemo(
    () =>
      settings && configured && !invalidRange
        ? calculateAttendanceBalance({
            userId: selected,
            settings,
            attendance: workspace.records.attendance,
            events: workspace.records.events,
            calendarCategories: workspace.records.calendarCategories,
            leave: workspace.records.leave,
            from: rangeFrom,
            to: rangeTo,
            now: instantDate(today),
            includeOpeningBalance: period === "total",
          })
        : undefined,
    [
      settings,
      configured,
      invalidRange,
      selected,
      workspace.records.attendance,
      workspace.records.events,
      workspace.records.calendarCategories,
      workspace.records.leave,
      rangeFrom,
      rangeTo,
      period,
      today,
    ],
  );
  const openWeek = balance?.weeks.find((row) => !row.completed);
  const completedWeeks = balance?.weeks.filter((row) => row.completed) || [];
  const seconds = balance?.completed.balanceSeconds || 0;
  const showCompleted = completedWeeks.length > 0 || seconds !== 0 || !openWeek;
  const status = seconds > 0 ? "Plusstunden" : seconds < 0 ? "Minusstunden" : "Ausgeglichen";
  const tone = seconds > 0 ? styles.positive : seconds < 0 ? styles.negative : "";
  const breakdown = balance && showCompleted && (
    <BalanceBreakdown
      amounts={balance.completed}
      opening={period === "total"}
      label="Berechnung abgeschlossener Wochen"
    />
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
        {configured && (
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
      {!configured ? (
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
                {showCompleted && (
                  <div className={`${styles.total} ${tone}`} aria-live="polite">
                    <strong className={styles.value}>
                      {signedHours(seconds)} <small>h</small>
                    </strong>
                    <span>
                      {status}
                      {period === "total" ? " gesamt" : " im Zeitraum"}
                    </span>
                    <span>
                      {completedWeeks.length
                        ? `Abgeschlossene Wochen bis ${dateLabel(completedWeeks.at(-1)!.end)}`
                        : "Startsaldo · noch keine abgeschlossene Woche"}
                    </span>
                  </div>
                )}
                <p className={styles.range}>
                  {balance.from > balance.to
                    ? `Beginnt am ${dateLabel(balance.from)}`
                    : `${dateLabel(balance.from)} – ${dateLabel(balance.to)}`}
                </p>
                {period === "month" && (
                  <p className="small muted">
                    Ganze Kalenderwochen mit Wochenbeginn in diesem Monat.
                  </p>
                )}
                {period === "custom" && (
                  <p className="small muted">Der Zeitraum umfasst ganze Kalenderwochen.</p>
                )}
                {openWeek && (
                  <section
                    className={styles.openWeek}
                    aria-label="Laufende Woche"
                    aria-live="polite"
                  >
                    <span>KW {openWeek.number} · laufende Woche</span>
                    <strong>
                      {hours(openWeek.attendanceSeconds + openWeek.creditSeconds)} /{" "}
                      {hours(openWeek.targetSeconds)} h
                    </strong>
                    <progress
                      aria-label="Erfülltes Wochensoll"
                      max={openWeek.targetSeconds || 1}
                      value={Math.min(
                        openWeek.attendanceSeconds + openWeek.creditSeconds,
                        openWeek.targetSeconds,
                      )}
                    />
                    <p>
                      {openWeek.balanceSeconds < 0
                        ? `Noch ${hours(-openWeek.balanceSeconds)} h bis zum Wochensoll.`
                        : openWeek.balanceSeconds > 0
                          ? `${signedHours(openWeek.balanceSeconds)} h über dem Wochensoll.`
                          : "Wochensoll erfüllt."}
                    </p>
                    {compact ? (
                      <details className={styles.details}>
                        <summary>Wochenberechnung anzeigen</summary>
                        <BalanceBreakdown
                          amounts={openWeek}
                          label="Berechnung der laufenden Woche"
                        />
                      </details>
                    ) : (
                      <BalanceBreakdown amounts={openWeek} label="Berechnung der laufenden Woche" />
                    )}
                    <p className="small muted">
                      Der Wochenstand geht am Sonntag ins Plus-/Minuskonto ein.
                    </p>
                  </section>
                )}
                {compact ? (
                  <details className={styles.details}>
                    <summary>Berechnung anzeigen</summary>
                    {breakdown}
                    <p>
                      Gespeicherte Anwesenheiten bis einschließlich heute zählen vollständig, auch
                      vor ihrer Endzeit. Laufende Timer zählen erst nach dem Buchen.
                    </p>
                  </details>
                ) : (
                  <>
                    {breakdown}
                    <p className="small muted">
                      Jede Kalenderwoche zählt mit ihrem gesamten Wochensoll. Du kannst deine
                      Stunden frei auf die Tage verteilen. Urlaub, Feiertag, Feiertagsausgleich und
                      Krank mit oder ohne Attest geben je eingetragenem Kalendertag Wochenstunden ÷
                      6 zusätzlich zur Anwesenheit. Mehrere Kennzeichen am selben Tag zählen nur
                      einmal. ABF, Ruhetag und halber freier Tag geben keine Gutschrift.
                      Gespeicherte Anwesenheiten bis einschließlich heute zählen vollständig, auch
                      vor ihrer Endzeit. Laufende Timer zählen erst nach dem Buchen.
                    </p>
                  </>
                )}
                {!compact && balance.weeks.length > 1 && (
                  <details className={styles.details}>
                    <summary>Wochenübersicht anzeigen</summary>
                    <ul className={styles.weekList}>
                      {[...balance.weeks].reverse().map((row) => (
                        <li key={row.start}>
                          <div>
                            <strong>
                              KW {row.number} / {row.year}
                            </strong>
                            <span>
                              {dateLabel(row.start)} – {dateLabel(row.end)}
                            </span>
                          </div>
                          <div>
                            <span>
                              {hours(row.attendanceSeconds + row.creditSeconds)} h von{" "}
                              {hours(row.targetSeconds)} h
                            </span>
                            <strong>
                              {signedHours(row.balanceSeconds)} h{row.completed ? "" : " · offen"}
                            </strong>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}

function BalanceBreakdown({
  amounts,
  opening = false,
  label,
}: {
  amounts: AttendanceBalanceAmounts;
  opening?: boolean;
  label: string;
}) {
  return (
    <dl className={styles.breakdown} aria-label={label}>
      <div>
        <dt>Anwesenheit</dt>
        <dd>{hours(amounts.attendanceSeconds)} h</dd>
      </div>
      <div>
        <dt>Tagesgutschriften</dt>
        <dd>{hours(amounts.creditSeconds)} h</dd>
      </div>
      <div>
        <dt>Wochensoll</dt>
        <dd>{hours(amounts.targetSeconds)} h</dd>
      </div>
      {opening && (
        <div>
          <dt>Startsaldo</dt>
          <dd>{signedHours(amounts.openingBalanceSeconds)} h</dd>
        </div>
      )}
    </dl>
  );
}

export { styles as attendanceBalanceStyles };
