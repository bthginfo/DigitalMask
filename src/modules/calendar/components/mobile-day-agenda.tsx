"use client";
import { useMemo } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import type { DomainRecord, Member } from "@/shared/contracts";
import { ids, value } from "@/shared/client-api";
import { calendarDayEntries, calendarInstanceTime } from "./day-details";
import type { CalendarInstance } from "./team-calendar";
import styles from "./mobile-day-sheet.module.css";

export function MobileDayAgenda({
  events,
  day,
  members,
  productions,
  canEdit,
  onOpen,
  onEdit,
}: {
  events: CalendarInstance[];
  day: string;
  members: Pick<Member, "id" | "name">[];
  productions: DomainRecord[];
  canEdit?: (record: DomainRecord) => boolean;
  onOpen: (record: DomainRecord) => void;
  onEdit?: (record: DomainRecord) => void;
}) {
  const selected = useMemo(() => calendarDayEntries(events, day), [events, day]);
  return (
    <ol className={`calendar-mobile-day-agenda ${styles.agenda}`} aria-live="polite">
      {selected.length ? (
        selected.map((event) => {
          const record = event.extendedProps.record;
          const names = ids(record.data, "participantIds").map(
            (id) => members.find((person) => person.id === id)?.name || "Ehemaliges Teammitglied",
          );
          const series = record.data.recurrence && record.data.recurrence !== "none";
          return (
            <li key={event.id} className={styles.event}>
              <button
                type="button"
                className={`team-mobile-service calendar-colored-event ${styles.service}`}
                style={{
                  borderLeftColor: event.borderColor,
                  backgroundColor: event.backgroundColor,
                  color: event.textColor,
                }}
                onClick={() => onOpen(record)}
              >
                <span className={styles.people}>{names.join(", ") || "Gäste/Aushilfen"}</span>
                <strong>{event.title}</strong>
                <span>
                  {calendarInstanceTime(event)} · {event.categoryName}
                  {event.background
                    ? event.background === "service"
                      ? " · Arbeitszeit"
                      : " · Hinweis"
                    : ""}
                </span>
                <span className={styles.location}>
                  {value(record.data, "location") || "Ort noch offen"} ·{" "}
                  {value(
                    productions.find((production) => production.id === record.data.productionId)
                      ?.data || {},
                    "title",
                  ) || "Ohne Produktion"}
                </span>
                <span className={styles.detailsCue}>
                  Details ansehen{series ? " · Terminserie" : ""}
                  <ChevronRight size={16} aria-hidden="true" />
                </span>
              </button>
              {onEdit && canEdit?.(record) && (
                <button
                  type="button"
                  className={`text-button ${styles.editAction}`}
                  aria-label={`${series ? "Terminserie" : "Termin"} ${event.title} bearbeiten`}
                  onClick={() => onEdit(record)}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {series ? "Serie bearbeiten" : "Bearbeiten"}
                </button>
              )}
            </li>
          );
        })
      ) : (
        <li className={`team-mobile-empty ${styles.empty}`}>
          <strong>Keine Termine an diesem Tag.</strong>
          Wähle einen anderen Tag oder blende weitere Kalender ein.
        </li>
      )}
    </ol>
  );
}
