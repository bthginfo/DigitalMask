"use client";
import { LinkedText } from "@/components/linked-text";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, hours, num, shiftDate, value, weekStart } from "@/shared/client-api";
import { categoryName } from "@/shared/domain-categories";
import { canManageRecord } from "@/shared/record-permissions";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { groupBookingPeople, isoWeek, type BookingWeekEntry } from "../history";
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
