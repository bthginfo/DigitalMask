"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { DomainRecord, Member, RecordData } from "@/shared/contracts";
import { ids, localDate, value } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { Empty } from "@/components/ui";
export type CalendarInstance = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
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
export function TeamCalendar({
  events,
  members,
  people,
  days,
  month,
  canPlan,
  productions,
  onOpen,
  onCreate,
}: {
  events: CalendarInstance[];
  members: Member[];
  people: string[];
  days: string[];
  month: boolean;
  canPlan: (person: string) => boolean;
  productions: DomainRecord[];
  onOpen: (record: DomainRecord) => void;
  onCreate: (data: RecordData) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(
    days.includes(localDate()) ? localDate() : days[0],
  );
  const day = days.includes(selectedDay) ? selectedDay : days[0];
  const team: Pick<Member, "id" | "name">[] = members.filter(
    (member) => isActiveStaff(member) && people.includes(member.id),
  );
  if (events.some((event) => !ids(event.extendedProps.record.data, "participantIds").length))
    team.push({ id: "", name: "Ohne Zuordnung" });
  const matches = (person: string, date: string) =>
    events.filter(
      (event) =>
        (person
          ? ids(event.extendedProps.record.data, "participantIds").includes(person)
          : !ids(event.extendedProps.record.data, "participantIds").length) &&
        localDate(new Date(new Date(event.end).getTime() - 1)) >= date &&
        localDate(new Date(event.start)) <= date,
    );
  const selected = team.flatMap((person) =>
    matches(person.id, day).map((event) => ({ person, event })),
  );
  return (
    <>
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
                        className="team-event"
                        style={{ borderLeftColor: event.backgroundColor }}
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
      <section className="team-day-detail">
        <header>
          <div>
            <p className="eyebrow">AUSGEWÄHLTE DIENSTE</p>
            <h3>Ein Tag im Team</h3>
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
          <div className="team-day-services">
            {selected.map(({ person, event }) => (
              <button
                key={`${person.id}:${event.id}`}
                style={{ borderLeftColor: event.backgroundColor }}
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
          <Empty
            title="Keine Dienste an diesem Tag."
            description="Wähle einen anderen Tag oder blende weitere Teammitglieder ein."
          />
        )}
      </section>
    </>
  );
}
