"use client";
import { useState, type ReactNode } from "react";
import { CalendarPlus, ChevronDown } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { useWorkspace } from "@/components/workspace-context";
import { dateLabel, hours, localDate, shiftDate } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { EventEditor } from "@/modules/calendar/components/event-editor";
import { calendarCategories } from "@/modules/calendar/components/client-calendar";
import type { BookingWeekEntry } from "../history";
import type { TimeDayMarker } from "../day-markers";
import { BookingList, WeekNavigator } from "./weekly-bookings";
import styles from "./week-view.module.css";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Bookings of one day; a booking across midnight contributes only that day's share. */
export function dayEntries(entries: BookingWeekEntry[], date: string): BookingWeekEntry[] {
  return entries.flatMap((entry) => {
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
}

/**
 * The one week view of the Zeit screen: week navigation, total, seven days that open to their
 * bookings (edit/delete), calendar markers and day credits, plus secondary rows as children.
 */
export function WeekDayOverview({
  kind,
  week,
  person,
  entries,
  markers,
  creditsByDay,
  onWeekChange,
  onEdit,
  onDetail,
  team = false,
  children,
}: {
  kind: "time" | "attendance";
  week: string;
  person: string;
  entries: BookingWeekEntry[];
  markers: TimeDayMarker[];
  creditsByDay?: ReadonlyMap<string, number>;
  onWeekChange: (week: string) => void;
  onEdit: (record: DomainRecord) => void;
  onDetail: (record: DomainRecord) => void;
  /** Admin view of everyone: the week's bookings grouped by person instead of days. */
  team?: boolean;
  children?: ReactNode;
}) {
  const { workspace } = useWorkspace();
  const today = localDate();
  const [expanded, setExpanded] = useState<string[]>([today]);
  const [marking, setMarking] = useState("");
  const [editing, setEditing] = useState<DomainRecord | null>(null);
  const allDayCategories = calendarCategories(workspace).filter((category) => category.allDay);
  const canMark =
    isActiveStaff(workspace.user) && person === workspace.user.id && allDayCategories.length > 0;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(week, index);
    const bookings = dayEntries(entries, date);
    const booked = bookings.reduce((sum, entry) => sum + entry.seconds, 0);
    const credit = creditsByDay?.get(date) || 0;
    return {
      date,
      index,
      bookings,
      credit,
      seconds: booked + credit,
      labels: markers.filter((marker) => marker.date === date),
    };
  });
  const credit = days.reduce((sum, day) => sum + day.credit, 0);
  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const label = kind === "attendance" ? "Anwesenheit" : "Produktionsstunden";
  return (
    <>
      <section className={styles.week} aria-label={`${label}: Woche`}>
        <header className={styles.head}>
          <WeekNavigator week={week} onChange={onWeekChange} />
          <div className={styles.total}>
            <strong>{hours(total)} h</strong>
            <small>{credit > 0 ? `inkl. ${hours(credit)} h Gutschrift` : "in dieser Woche"}</small>
          </div>
        </header>
        {team ? (
          entries.length ? (
            <BookingList
              entries={entries}
              kind={kind}
              onEdit={onEdit}
              onDetail={onDetail}
              groupByPerson
            />
          ) : (
            <p className={styles.none}>Keine Buchungen in dieser Woche.</p>
          )
        ) : (
          <ol className={styles.days}>
            {days.map((day) => {
              const summary = (
                <>
                  <span className={styles.date}>
                    <strong>{weekdays[day.index]}</strong>
                    <span>{dateLabel(day.date)}</span>
                  </span>
                  <span className={styles.meta}>
                    {day.labels.map((marker) => (
                      <span key={marker.event.id} className={styles.tag}>
                        {marker.label}
                      </span>
                    ))}
                    {day.bookings.length > 0 && (
                      <span className={styles.count}>
                        {day.bookings.length} {day.bookings.length === 1 ? "Eintrag" : "Einträge"}
                      </span>
                    )}
                  </span>
                  <strong className={styles.hours}>
                    {day.seconds ? `${hours(day.seconds)} h` : "–"}
                  </strong>
                </>
              );
              const content = day.bookings.length > 0 || day.labels.length > 0;
              return (
                <li
                  key={day.date}
                  className={styles.day}
                  data-today={day.date === today || undefined}
                >
                  {content ? (
                    <details
                      open={expanded.includes(day.date)}
                      onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setExpanded((current) =>
                          open
                            ? [...new Set([...current, day.date])]
                            : current.filter((date) => date !== day.date),
                        );
                      }}
                    >
                      <summary className={styles.summary}>
                        {summary}
                        <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
                      </summary>
                      <div className={styles.body}>
                        {(day.labels.length > 0 || day.credit > 0) && (
                          <div className={styles.markers}>
                            {day.labels.map((marker) => (
                              <button
                                key={marker.event.id}
                                type="button"
                                className={styles.marker}
                                title={marker.title || marker.label}
                                onClick={() => {
                                  if (canMark && !marker.event.data.leaveId)
                                    setEditing(marker.event);
                                  else onDetail(marker.event);
                                }}
                              >
                                {marker.label}
                              </button>
                            ))}
                            {day.credit > 0 && (
                              <span className={styles.credit}>
                                +{hours(day.credit)} h Tagesgutschrift
                              </span>
                            )}
                          </div>
                        )}
                        {day.bookings.length > 0 && (
                          <BookingList
                            entries={day.bookings}
                            kind={kind}
                            showDate={false}
                            onEdit={onEdit}
                            onDetail={onDetail}
                          />
                        )}
                      </div>
                    </details>
                  ) : (
                    <div className={`${styles.summary} ${styles.empty}`}>
                      {summary}
                      <span className={styles.chevron} aria-hidden="true" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {(children || canMark) && (
          <div className={styles.secondary}>
            {children}
            {canMark && (
              <button
                type="button"
                className={styles.row}
                onClick={() =>
                  setMarking(today >= week && today <= shiftDate(week, 6) ? today : week)
                }
              >
                <CalendarPlus size={18} aria-hidden="true" />
                <span>
                  <strong>Tag kennzeichnen</strong>
                  <small>ABF, Ruhetag oder Urlaub eintragen</small>
                </span>
              </button>
            )}
          </div>
        )}
      </section>
      {marking && (
        <EventEditor
          defaults={{
            category:
              allDayCategories.find((category) => category.key === "abf")?.key ||
              allDayCategories[0]?.key,
            allDay: true,
            start: `${marking}T00:00`,
            end: `${marking}T00:00`,
            participantIds: [workspace.user.id],
          }}
          onClose={() => setMarking("")}
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
