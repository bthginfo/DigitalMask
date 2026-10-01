"use client";
import type { DomainRecord, Member } from "@/shared/contracts";
import { dateLabel, ids, localDate, value } from "@/shared/client-api";
import type { CalendarInstance } from "./team-calendar";

export function MobileDayAgenda({
  events,
  day,
  members,
  productions,
  onOpen,
}: {
  events: CalendarInstance[];
  day: string;
  members: Pick<Member, "id" | "name">[];
  productions: DomainRecord[];
  onOpen: (record: DomainRecord) => void;
}) {
  const selected = events.filter(
    (event) =>
      localDate(new Date(new Date(event.end).getTime() - 1)) >= day &&
      localDate(new Date(event.start)) <= day,
  );
  return (
    <div className="calendar-mobile-day-agenda" aria-live="polite">
      {selected.length ? (
        selected.map((event) => {
          const names = members
            .filter((person) =>
              ids(event.extendedProps.record.data, "participantIds").includes(person.id),
            )
            .map((person) => person.name);
          const sameDay =
            localDate(new Date(event.start)) ===
            localDate(new Date(new Date(event.end).getTime() - 1));
          const clock = (date: string) =>
            new Intl.DateTimeFormat("de-DE", {
              timeZone: "Europe/Berlin",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(date));
          const time = event.allDay
            ? "Ganztägig"
            : sameDay
              ? `${clock(event.start)}–${clock(event.end)}`
              : `${dateLabel(event.start, true)} – ${dateLabel(event.end, true)}`;
          return (
            <button
              key={event.id}
              className="team-mobile-service"
              style={{ borderLeftColor: event.backgroundColor }}
              onClick={() => onOpen(event.extendedProps.record)}
            >
              <span className="small muted">{names.join(", ") || "Ohne Zuordnung"}</span>
              <strong>{event.title}</strong>
              <span>
                {time} · {event.categoryName}
              </span>
              <span className="small muted">
                {value(event.extendedProps.record.data, "location") || "Ort noch offen"} ·{" "}
                {value(
                  productions.find(
                    (production) => production.id === event.extendedProps.record.data.productionId,
                  )?.data || {},
                  "title",
                ) || "Ohne Produktion"}
              </span>
            </button>
          );
        })
      ) : (
        <p className="team-mobile-empty">
          Keine Termine an diesem Tag. Wähle oben einen anderen Tag.
        </p>
      )}
    </div>
  );
}
