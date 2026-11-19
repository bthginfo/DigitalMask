"use client";
import { LinkedText } from "@/components/linked-text";
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  instantDate,
  num,
  shiftDate,
  value,
  weekStart,
} from "@/shared/client-api";
import { categoryName } from "@/shared/domain-categories";
import { canManageRecord } from "@/shared/record-permissions";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { groupBookingPeople, isoWeek, type BookingWeek, type BookingWeekEntry } from "../history";
import { WeekDayOverview } from "./week-day-overview";
import { TimeBookingDelete } from "./time-booking-delete";
import styles from "./time-history.module.css";

export function WeekNavigator({
  week,
  onChange,
}: {
  week: string;
  onChange: (week: string) => void;
}) {
  const identity = isoWeek(week);
  return (
    <div className={styles.weekNavigator} aria-label="Woche auswählen">
      <button
        className="button secondary"
        aria-label="Vorherige Woche"
        onClick={() => onChange(shiftDate(week, -7))}
      >
        <ChevronLeft size={18} />
      </button>
      <label>
        <span>
          KW {identity.number} · {identity.year} · Woche ab
        </span>
        <input
          type="date"
          aria-label="Woche ab"
          value={week}
          onChange={(event) => {
            if (event.target.value) onChange(isoWeek(event.target.value).start);
          }}
        />
      </label>
      <button
        className="button secondary"
        aria-label="Nächste Woche"
        onClick={() => onChange(shiftDate(week, 7))}
      >
        <ChevronRight size={18} />
      </button>
      {week !== weekStart() && (
        <Button onClick={() => onChange(weekStart())}>Aktuelle Woche</Button>
      )}
    </div>
  );
}

export function BookingList({
  entries,
  kind,
  onEdit,
  onDetail,
  groupByPerson = false,
  showDate = true,
}: {
  entries: BookingWeekEntry[];
  kind: "time" | "attendance";
  onEdit: (record: DomainRecord) => void;
  onDetail: (record: DomainRecord) => void;
  groupByPerson?: boolean;
  showDate?: boolean;
}) {
  const { workspace } = useWorkspace();
  if (groupByPerson)
    return (
      <div className={styles.personGroups}>
        {groupBookingPeople(entries, workspace.members).map((person) => (
          <section key={person.userId} aria-label={`Arbeitszeit von ${person.name}`}>
            <header className={styles.personHeading}>
              <div>
                <h4>{person.name}</h4>
                <span className="small muted">
                  {person.entries.length} {person.entries.length === 1 ? "Buchung" : "Buchungen"}
                  {person.former ? " · ehemaliges Teammitglied" : ""}
                </span>
              </div>
              <strong>{hours(person.seconds)} h</strong>
            </header>
            <BookingList entries={person.entries} kind={kind} onEdit={onEdit} onDetail={onDetail} />
          </section>
        ))}
      </div>
    );
  return (
    <ul className={styles.bookingList}>
      {entries.map(({ record, seconds, allocations }) => {
        const production = workspace.records.productions.find(
          (row) => row.id === record.data.productionId,
        );
        const from = allocations[0]?.date || value(record.data, "date");
        const to = allocations.at(-1)?.date || from;
        return (
          <li key={record.id} className={styles.bookingRow}>
            <div className={styles.bookingContent}>
              {showDate && (
                <span className={styles.bookingDate}>
                  {dateLabel(from)}
                  {from !== to ? ` – ${dateLabel(to)}` : ""}
                </span>
              )}
              <button className={styles.detailLink} onClick={() => onDetail(record)}>
                {value(record.data, "title") || "Anwesenheit"}
              </button>
              <span className="small muted">
                {kind === "time" ? (
                  `${production ? value(production.data, "title") : "Allgemein"} · ${categoryName("time", value(record.data, "category"), workspace.records.categories)}`
                ) : (
                  <LinkedText>{value(record.data, "notes")}</LinkedText>
                )}
              </span>
              {value(record.data, "start") && value(record.data, "end") && (
                <span className={styles.bookingInterval}>
                  {dateLabel(value(record.data, "start"), true)} –{" "}
                  {dateLabel(value(record.data, "end"), true)}
                  {num(record.data, "pauseSeconds") > 0 &&
                    ` · ${Math.round(num(record.data, "pauseSeconds") / 60)} min Pause`}
                </span>
              )}
              {seconds !== num(record.data, "durationSeconds") && (
                <span className="small muted">
                  {showDate ? "Anteil im Zeitraum" : "Anteil am Tag"} · gesamt{" "}
                  {hours(num(record.data, "durationSeconds"))} h
                </span>
              )}
            </div>
            <strong className={styles.bookingHours}>{hours(seconds)} h</strong>
            {canManageRecord(workspace.user, kind, record) && (
              <div className={styles.bookingActions}>
                <Button variant="ghost" onClick={() => onEdit(record)}>
                  <Pencil size={15} /> Bearbeiten
                </Button>
                <TimeBookingDelete record={record} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const attendanceDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "short",
});

export function AttendanceWeekList({
  week,
  onEdit,
  onDetail,
}: {
  week: BookingWeek;
  onEdit: (record: DomainRecord) => void;
  onDetail: (record: DomainRecord) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, offset) => shiftDate(week.end, -offset));
  return (
    <ol
      className={styles.attendanceDays}
      aria-label="Anwesenheiten und Kalenderkennzeichen nach Tag"
    >
      {dates.map((date) => {
        const entries = week.entries.flatMap((entry) => {
          const allocations = entry.allocations.filter((allocation) => allocation.date === date);
          return allocations.length
            ? [
                {
                  ...entry,
                  allocations,
                  seconds: allocations.reduce((sum, allocation) => sum + allocation.seconds, 0),
                },
              ]
            : [];
        });
        const markers = week.markers.filter((marker) => marker.date === date);
        const credit = week.creditsByDay.get(date) || 0;
        if (!entries.length && !markers.length) return null;
        return (
          <li key={date} className={styles.attendanceDay}>
            <h4 className={styles.attendanceDate}>
              <time dateTime={date}>{attendanceDate.format(instantDate(date))}</time>
            </h4>
            {markers.length > 0 && (
              <div className={styles.attendanceMarkers}>
                <div className={styles.attendanceLabels}>
                  {markers.map((marker) => (
                    <button
                      key={marker.event.id}
                      type="button"
                      className={styles.dayMarker}
                      title={marker.title || undefined}
                      onClick={() => onDetail(marker.event)}
                    >
                      {marker.label}
                    </button>
                  ))}
                </div>
                {credit > 0 && (
                  <span className={styles.attendanceCredit}>
                    <strong>+{hours(credit)} h</strong>
                    <small>Tagesgutschrift</small>
                  </span>
                )}
              </div>
            )}
            {entries.length > 0 && (
              <BookingList
                entries={entries}
                kind="attendance"
                showDate={false}
                onEdit={onEdit}
                onDetail={onDetail}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function WeeklyHistory({
  weeks,
  selectedWeek,
  kind,
  person,
  filtered,
  onAllSeasons,
  onSelectWeek,
  onEdit,
  onDetail,
  onBookDay,
  groupByPerson = false,
}: {
  weeks: BookingWeek[];
  selectedWeek: string;
  kind: "time" | "attendance";
  person: string;
  filtered: boolean;
  onAllSeasons: () => void;
  onSelectWeek: (week: string) => void;
  onEdit: (record: DomainRecord) => void;
  onDetail: (record: DomainRecord) => void;
  onBookDay?: (date: string) => void;
  groupByPerson?: boolean;
}) {
  const [visible, setVisible] = useState(6);
  const history = weeks.filter((week) => week.start !== selectedWeek);
  return (
    <section
      className={styles.history}
      aria-label={`${kind === "attendance" ? "Anwesenheit" : "Arbeitszeit"}: Wochenverlauf`}
    >
      <header className={styles.sectionHeading}>
        <div>
          <h2>Wochenverlauf</h2>
          <p className="small muted">Woche aufklappen, Buchungen bearbeiten oder löschen.</p>
        </div>
        {filtered && <Button onClick={onAllSeasons}>Alle Spielzeiten ansehen</Button>}
      </header>
      {history.length ? (
        <div className={styles.historyWeeks}>
          {history.slice(0, visible).map((week) => (
            <details key={week.start} className={styles.historyWeek}>
              <summary>
                <span>
                  <strong>
                    KW {week.number} · {week.year}
                  </strong>
                  <small>
                    {dateLabel(week.start)} – {dateLabel(week.end)} · {week.entries.length}{" "}
                    {week.entries.length === 1 ? "Buchung" : "Buchungen"}
                    {week.markers.length
                      ? ` · ${[...new Set(week.markers.map((marker) => marker.label))].join(", ")}`
                      : ""}
                  </small>
                </span>
                <strong className={styles.historyTotal}>
                  {hours(week.seconds + week.creditSeconds)} h
                </strong>
                <ChevronDown size={18} />
              </summary>
              {kind === "attendance" ? (
                <AttendanceWeekList week={week} onEdit={onEdit} onDetail={onDetail} />
              ) : (
                <BookingList
                  entries={week.entries}
                  kind={kind}
                  onEdit={onEdit}
                  onDetail={onDetail}
                  groupByPerson={groupByPerson}
                />
              )}
              {(week.markers.length > 0 || onBookDay) && (
                <WeekDayOverview
                  week={week.start}
                  person={person}
                  entries={week.entries}
                  markers={week.markers}
                  creditsByDay={kind === "attendance" ? week.creditsByDay : undefined}
                  onDetail={onDetail}
                  onBookDay={onBookDay}
                  bookingLabel={kind === "attendance" ? "Anwesenheit" : "Zeit"}
                />
              )}
              <div className={styles.historyFooter}>
                <Button onClick={() => onSelectWeek(week.start)}>Diese Woche auswählen</Button>
              </div>
            </details>
          ))}
          {history.length > visible && (
            <Button onClick={() => setVisible((count) => count + 6)}>
              Ältere Wochen zeigen ({history.length - visible})
            </Button>
          )}
        </div>
      ) : (
        <p className={styles.emptyInline}>
          {filtered
            ? "Keine weiteren Wochen in diesem Zeitraum. Frühere Buchungen findest du unter „Alle Spielzeiten ansehen“."
            : "Noch keine weiteren Wochen gebucht."}
        </p>
      )}
    </section>
  );
}
