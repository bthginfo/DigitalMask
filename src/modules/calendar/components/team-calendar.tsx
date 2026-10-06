"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { DomainRecord, Member, RecordData } from "@/shared/contracts";
import { ids, instantDate, localDate, shiftDate, value, weekStart } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { Empty } from "@/components/ui";
import { calendarDayIndex } from "./day-details";
import { MobileDaySheet } from "./mobile-day-sheet";
import styles from "./mobile-calendar.module.css";
export type CalendarInstance = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  allDay: boolean;
  categoryName: string;
  extendedProps: { record: DomainRecord };
};
const clock = (date: string) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const fullDay = (date: string) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instantDate(date));
export function TeamCalendar({
  events,
  members,
  people,
  days,
  month,
  mobile,
  canPlan,
  canEdit,
  suspended,
  productions,
  onOpen,
  onEdit,
  onCreate,
}: {
  events: CalendarInstance[];
  members: Member[];
  people: string[];
  days: string[];
  month: boolean;
  mobile: boolean;
  canPlan: (person: string) => boolean;
  canEdit: (record: DomainRecord) => boolean;
  suspended: boolean;
  productions: DomainRecord[];
  onOpen: (record: DomainRecord) => void;
  onEdit: (record: DomainRecord) => void;
  onCreate: (data: RecordData) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(
    days.includes(localDate()) ? localDate() : days[0],
  );
  const [daySheetOpen, setDaySheetOpen] = useState(false);
  const mobileCalendar = useRef<HTMLElement>(null);
  const day = days.includes(selectedDay) ? selectedDay : days[0];
  const team = useMemo(() => {
    const selected: Pick<Member, "id" | "name">[] = members.filter(
      (member) => isActiveStaff(member) && people.includes(member.id),
    );
    if (events.some((event) => !ids(event.extendedProps.record.data, "participantIds").length))
      selected.push({ id: "", name: "Ohne Zuordnung" });
    return selected;
  }, [members, people, events]);
  const entriesByDay = useMemo(
    () => calendarDayIndex(events, days[0], days[days.length - 1]),
    [events, days],
  );
  const matches = (person: string, date: string) =>
    (entriesByDay.get(date) || []).filter((event) =>
      person
        ? ids(event.extendedProps.record.data, "participantIds").includes(person)
        : !ids(event.extendedProps.record.data, "participantIds").length,
    );
  const selected = team.flatMap((person) =>
    matches(person.id, day).map((event) => ({ person, event })),
  );
  const selectedCount = entriesByDay.get(day)?.length || 0;
  const gridStart = weekStart(instantDate(days[0]));
  const offset = Math.round(
    (instantDate(days[0]).getTime() - instantDate(gridStart).getTime()) / 86400000,
  );
  const gridDays = Array.from({ length: Math.ceil((offset + days.length) / 7) * 7 }, (_, index) =>
    shiftDate(gridStart, index),
  );

  return (
    <>
      <section
        ref={mobileCalendar}
        className="team-mobile-calendar"
        aria-label={month ? "Mobiler Teammonatskalender" : "Mobiler Teamwochenkalender"}
      >
        <div className="team-mobile-weekdays" aria-hidden="true">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className={`team-mobile-dates${gridDays.length > 35 ? " is-six-weeks" : ""}`}>
          {gridDays.map((date) => {
            const inPeriod = days.includes(date);
            const entries = inPeriod ? entriesByDay.get(date) || [] : [];
            const colors = [...new Set(entries.map((event) => event.backgroundColor))].slice(0, 3);
            return inPeriod ? (
              <button
                key={date}
                data-date={date}
                className={`team-mobile-date${day === date ? " is-selected" : ""}${date === localDate() ? " is-today" : ""}`}
                aria-pressed={day === date}
                aria-haspopup="dialog"
                aria-label={`${fullDay(date)}: ${entries.length} ${entries.length === 1 ? "Termin" : "Termine"}. Details anzeigen`}
                onClick={() => {
                  setSelectedDay(date);
                  setDaySheetOpen(true);
                }}
              >
                <span className="team-mobile-date-number">{Number(date.slice(-2))}</span>
                <span className="team-mobile-date-markers" aria-hidden="true">
                  {colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                {!!entries.length && (
                  <span className="team-mobile-date-count" aria-hidden="true">
                    {entries.length}
                  </span>
                )}
              </button>
            ) : (
              <span className="team-mobile-date outside-period" key={date} aria-hidden="true">
                {Number(date.slice(-2))}
              </span>
            );
          })}
        </div>
      </section>
      <p className="team-scroll-hint small muted">
        Weitere Tage findest du durch seitliches Wischen oder mit den Pfeiltasten. Ein Tag lässt
        sich darunter einzeln ansehen.
      </p>
      <div
        className={`table-scroll team-calendar ${month ? "team-month-calendar" : ""}`}
        role="region"
        aria-label={month ? "Teammonatskalender" : "Teamwochenkalender"}
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Team</th>
              {days.map((date) => (
                <th key={date}>
                  <button
                    className={`team-day-heading ${day === date ? "selected" : ""}`}
                    aria-label={`Dienste am ${date} anzeigen`}
                    onClick={() => setSelectedDay(date)}
                  >
                    {new Intl.DateTimeFormat("de-DE", {
                      timeZone: "Europe/Berlin",
                      weekday: "short",
                      day: "numeric",
                      ...(!month ? { month: "numeric" as const } : {}),
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((person) => (
              <tr key={person.id}>
                <th>{person.name}</th>
                {days.map((date) => (
                  <td key={date} className={day === date ? "selected-day" : ""}>
                    {matches(person.id, date).map((event) => (
                      <button
                        key={event.id}
                        className="team-event calendar-colored-event"
                        style={{
                          borderLeftColor: event.borderColor,
                          backgroundColor: event.backgroundColor,
                          color: event.textColor,
                        }}
                        aria-label={`${event.title} · ${event.categoryName} · ${event.allDay ? "ganztägig" : `${clock(event.start)} bis ${clock(event.end)}`} · ${person.name}`}
                        onClick={() => {
                          setSelectedDay(date);
                          onOpen(event.extendedProps.record);
                        }}
                      >
                        <strong>{event.title}</strong>
                        <span>
                          {event.allDay ? "Ganztägig" : `${clock(event.start)}–${clock(event.end)}`}
                        </span>
                      </button>
                    ))}
                    {canPlan(person.id) && (
                      <button
                        className="team-add"
                        aria-label={`Termin für ${person.name} am ${date}`}
                        onClick={() =>
                          onCreate({
                            start: `${date}T09:00`,
                            end: `${date}T17:00`,
                            participantIds: person.id ? [person.id] : [],
                          })
                        }
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className={styles.daySummary}>
        <button type="button" aria-haspopup="dialog" onClick={() => setDaySheetOpen(true)}>
          <span>
            <strong className={styles.summaryTitle}>{fullDay(day)}</strong>
            <span>
              {selectedCount} {selectedCount === 1 ? "Termin" : "Termine"} · Tagesdetails anzeigen
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>
      {mobile && daySheetOpen && !suspended && (
        <MobileDaySheet
          events={events}
          day={day}
          members={members}
          productions={productions}
          contextLabel={`${team.filter((person) => person.id).length} Teamkalender`}
          minDay={days[0]}
          maxDay={days[days.length - 1]}
          createOptions={team
            .filter((person) => canPlan(person.id))
            .map((person) => ({
              id: person.id,
              label: `Termin für ${person.name}`,
              personName: person.name,
              participantIds: person.id ? [person.id] : [],
            }))}
          canEdit={canEdit}
          onSelect={setSelectedDay}
          onClose={() => setDaySheetOpen(false)}
          onRestoreFocus={() =>
            mobileCalendar.current
              ?.querySelector<HTMLButtonElement>(`[data-date="${day}"]`)
              ?.focus({ preventScroll: true })
          }
          onOpen={onOpen}
          onEdit={onEdit}
          onCreate={onCreate}
        />
      )}
      <section className={`team-day-detail ${styles.desktopDayDetail}`}>
        <header>
          <div>
            <p className="eyebrow">AUSGEWÄHLTE DIENSTE</p>
            <h3>{fullDay(day)}</h3>
          </div>
          <label>
            Tag auswählen
            <input
              type="date"
              min={days[0]}
              max={days[days.length - 1]}
              value={day}
              onChange={(event) => setSelectedDay(event.target.value)}
            />
          </label>
        </header>
        {selected.length ? (
          <div className="team-day-services team-desktop-services">
            {selected.map(({ person, event }) => (
              <button
                key={`${person.id}:${event.id}`}
                className="calendar-colored-event"
                style={{
                  borderLeftColor: event.borderColor,
                  backgroundColor: event.backgroundColor,
                  color: event.textColor,
                }}
                onClick={() => onOpen(event.extendedProps.record)}
              >
                <span className="small muted">
                  {person.name} · {event.categoryName}
                </span>
                <strong>{event.title}</strong>
                <span>
                  {event.allDay ? "Ganztägig" : `${clock(event.start)}–${clock(event.end)}`}
                </span>
                <span className="small muted">
                  {value(event.extendedProps.record.data, "location") || "Ort noch offen"} ·{" "}
                  {value(
                    productions.find(
                      (production) =>
                        production.id === event.extendedProps.record.data.productionId,
                    )?.data || {},
                    "title",
                  ) || "Ohne Produktion"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="team-desktop-services">
            <Empty
              title="Keine Dienste an diesem Tag."
              description="Wähle einen anderen Tag oder blende weitere Teammitglieder ein."
            />
          </div>
        )}
      </section>
    </>
  );
}
