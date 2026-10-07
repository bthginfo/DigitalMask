"use client";
import { useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { dateLabel, hours, localDate, shiftDate } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { EventEditor } from "@/modules/calendar/components/event-editor";
import { calendarCategories } from "@/modules/calendar/components/client-calendar";
import type { BookingWeekEntry } from "../history";
import type { TimeDayMarker } from "../day-markers";
import styles from "./time-history.module.css";

export function WeekDayOverview({
  week,
  person,
  entries,
  markers,
  onDetail,
  onBookDay,
  bookingLabel = "Zeit",
}: {
  week: string;
  person: string;
  entries: BookingWeekEntry[];
  markers: TimeDayMarker[];
  onDetail: (record: DomainRecord) => void;
  onBookDay?: (date: string) => void;
  bookingLabel?: string;
}) {
  const { workspace } = useWorkspace();
  const [day, setDay] = useState("");
  const [editing, setEditing] = useState<DomainRecord | null>(null);
  const allDayCategories = calendarCategories(workspace).filter((category) => category.allDay);
  const canMark =
    isActiveStaff(workspace.user) && person === workspace.user.id && allDayCategories.length > 0;
  const defaultDay = localDate() >= week && localDate() <= shiftDate(week, 6) ? localDate() : week;
  return (
    <>
      <section className={styles.dayOverview} aria-label="Tagesübersicht mit Kalenderkennzeichen">
        <header className={styles.sectionHeading}>
          <div>
            <h2>Tagesübersicht</h2>
            <p className="small muted">
              {onBookDay
                ? "Wähle einen Tag, um Zeiten nachzutragen. Freie Tage trägst du über „Tag kennzeichnen“ ein."
                : "ABF, Ruhetag und Abwesenheiten bleiben Kalenderkennzeichen ohne Stunden."}
            </p>
          </div>
          {canMark && (
            <Button onClick={() => setDay(defaultDay)}>
              <CalendarPlus size={16} /> Tag kennzeichnen
            </Button>
          )}
        </header>
        <div className={styles.dayGrid}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = shiftDate(week, index);
            const labels = markers.filter((marker) => marker.date === date);
            const seconds = entries
              .flatMap((entry) => entry.allocations)
              .filter((allocation) => allocation.date === date)
              .reduce((total, allocation) => total + allocation.seconds, 0);
            const summary = (
              <>
                <span className={styles.dayDate}>
                  <strong>{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][index]}</strong>{" "}
                  {dateLabel(date)}
                </span>
                <strong className={styles.dayHours}>{seconds ? `${hours(seconds)} h` : "–"}</strong>
              </>
            );
            return (
              <div key={date} className={styles.overviewDay}>
                {onBookDay ? (
                  <button
                    type="button"
                    className={styles.dayBooking}
                    aria-label={`${bookingLabel} für ${dateLabel(date)} nachtragen`}
                    onClick={() => onBookDay(date)}
                  >
                    {summary}
                    <span className={styles.dayBookingLabel}>
                      <Plus size={13} /> Zeit
                    </span>
                  </button>
                ) : (
                  <div className={styles.daySummary}>{summary}</div>
                )}
                {labels.map((marker) => (
                  <button
                    key={`${marker.event.id}:${date}`}
                    className={styles.dayMarker}
                    title={marker.title || marker.label}
                    onClick={() => {
                      if (canMark && !marker.event.data.leaveId) setEditing(marker.event);
                      else onDetail(marker.event);
                    }}
                  >
                    {marker.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
      {day && (
        <EventEditor
          defaults={{
            category:
              allDayCategories.find((category) => category.key === "abf")?.key ||
              allDayCategories[0]?.key,
            allDay: true,
            start: `${day}T00:00`,
            end: `${day}T00:00`,
            participantIds: [workspace.user.id],
          }}
          onClose={() => setDay("")}
        />
      )}
      {editing && (
        <EventEditor
          record={workspace.records.events.find((row) => row.id === editing.id) || editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
