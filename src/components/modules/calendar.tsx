"use client";
import { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import deLocale from "@fullcalendar/core/locales/de";
import luxonPlugin from "@fullcalendar/luxon3";
import { occurrences } from "@/modules/calendar/occurrences";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, ids, localDate, shiftDate, value, weekStart } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
import { statusLabels } from "../resource-fields";
const colors: Record<string, string> = {
  service: "#18765c",
  rehearsal: "#427ba8",
  performance: "#b86050",
  preparation: "#9a742c",
  absence: "#757b8b",
};
export function expandEvents(records: DomainRecord[], rangeStart: string, rangeEnd: string) {
  return records.flatMap((record) => {
    if (
      !Number.isFinite(new Date(value(record.data, "start")).getTime()) ||
      !Number.isFinite(new Date(value(record.data, "end")).getTime())
    )
      return [];
    return occurrences(record, new Date(rangeStart), new Date(rangeEnd)).map((instance) => ({
      id: `${record.id}:${instance.start.toISOString()}`,
      title: value(record.data, "title"),
      start: instance.start.toISOString(),
      end: instance.end.toISOString(),
      backgroundColor: colors[value(record.data, "category")] || colors.service,
      borderColor: "transparent",
      editable: !record.data.recurrence || record.data.recurrence === "none",
      extendedProps: { record },
    }));
  });
}
export function CalendarModule({ productionId = "" }: { productionId?: string }) {
  const { workspace, save, action, busy } = useWorkspace();
  const admin = workspace.user.role !== "user";
  const calendar = useRef<FullCalendar>(null);
  const [view, setView] = useState("month");
  const [people, setPeople] = useState<string[]>(
    workspace.user.role === "superadmin" ? [] : [workspace.user.id],
  );
  const [category, setCategory] = useState("");
  const [project, setProject] = useState(productionId);
  const [range, setRange] = useState(() => ({
    start: weekStart(),
    end: localDate(new Date(Date.now() + 42 * 86400000)),
  }));
  const [exportDates, setExportDates] = useState(() => ({ from: localDate(), to: localDate() }));
  const [title, setTitle] = useState("");
  const [teamDate, setTeamDate] = useState(weekStart());
  const [editor, setEditor] = useState<{
    kind: "events" | "leave";
    defaults?: Record<string, unknown>;
  } | null>(null);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const filtered = workspace.records.events.filter(
    (x) =>
      (!project || x.data.productionId === project) &&
      (!category || x.data.category === category) &&
      (!people.length || ids(x.data, "participantIds").some((id) => people.includes(id))),
  );
  const expanded = useMemo(
    () =>
      expandEvents(
        filtered,
        view === "team" ? teamDate : range.start,
        view === "team" ? shiftDate(teamDate, 7) : range.end,
      ),
    [filtered, range, teamDate, view],
  );
  const overlaps = expanded.filter((event, i) =>
    expanded
      .slice(i + 1)
      .some(
        (other) =>
          event.start < other.end &&
          event.end > other.start &&
          ids(event.extendedProps.record.data, "participantIds").some((id) =>
            ids(other.extendedProps.record.data, "participantIds").includes(id),
          ),
      ),
  );
  const leaves = workspace.records.leave
    .filter((x) => admin || x.data.userId === workspace.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const changeView = (next: string) => {
    setView(next);
    if (next !== "team")
      calendar.current?.getApi().changeView(
        (
          {
            month: "dayGridMonth",
            week: "timeGridWeek",
            day: "timeGridDay",
            agenda: "listMonth",
          } as Record<string, string>
        )[next],
      );
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };
  const teamDays = Array.from({ length: 7 }, (_, i) => {
    return shiftDate(teamDate, i);
  });
  return (
    <>
      <PageHeader
        eyebrow="DEIN DIENSTPLAN. GEMEINSAM GEPLANT."
        title="Kalender"
        description="Eigene Dienste, Teamkalender und freie Tage im Überblick."
      >
        <ExportButton onClick={() => setExporting(true)} />
        <Button onClick={() => setEditor({ kind: "leave" })}>Freien Tag wünschen</Button>
        {admin && (
          <Button
            variant="primary"
            onClick={() => setEditor({ kind: "events", defaults: { participantIds: people } })}
          >
            <Plus size={16} />
            Termin
          </Button>
        )}
      </PageHeader>
      <div className="calendar-layout">
        <aside className="calendar-filters">
          <h3>Kalender einblenden</h3>
          {workspace.user.role !== "superadmin" && (
            <button className="text-button" onClick={() => setPeople([workspace.user.id])}>
              Nur meinen Kalender
            </button>
          )}
          {workspace.members.filter(isActiveStaff).map((member) => (
            <label className="check-label" key={member.id}>
              <input
                type="checkbox"
                checked={people.includes(member.id)}
                onChange={(event) =>
                  setPeople(
                    event.target.checked
                      ? [...people, member.id]
                      : people.filter((x) => x !== member.id),
                  )
                }
              />
              <span className="calendar-person">
                {member.name}
                {member.id === workspace.user.id && <span className="small muted"> (ich)</span>}
              </span>
            </label>
          ))}
          <p className="small muted">Ohne Auswahl werden alle Kalender angezeigt.</p>
          <label>
            Produktion
            <select
              value={project}
              disabled={!!productionId}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Alle Produktionen</option>
              {workspace.records.productions.map((x) => (
                <option key={x.id} value={x.id}>
                  {value(x.data, "title")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kategorie
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {Object.entries(colors).map(([key]) => (
                <option key={key} value={key}>
                  {statusLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="calendar-legend">
            {Object.entries(colors).map(([key, color]) => (
              <span key={key}>
                <i style={{ background: color }} />
                {statusLabels[key]}
              </span>
            ))}
          </div>
        </aside>
        <section className="calendar-board">
          <div className="calendar-toolbar">
            <div className="calendar-navigation">
              <button
                className="icon-button"
                aria-label="Vorheriger Zeitraum"
                onClick={() =>
                  view === "team"
                    ? setTeamDate(shiftDate(teamDate, -7))
                    : calendar.current?.getApi().prev()
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Nächster Zeitraum"
                onClick={() =>
                  view === "team"
                    ? setTeamDate(shiftDate(teamDate, 7))
                    : calendar.current?.getApi().next()
                }
              >
                <ChevronRight size={18} />
              </button>
              <Button
                onClick={() =>
                  view === "team" ? setTeamDate(weekStart()) : calendar.current?.getApi().today()
                }
              >
                Heute
              </Button>
              <h2>{view === "team" ? `Woche ab ${dateLabel(teamDate)}` : title}</h2>
            </div>
            <div className="segmented">
              {[
                ["month", "Monat"],
                ["week", "Woche"],
                ["day", "Tag"],
                ["agenda", "Agenda"],
                ["team", "Team"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={view === key ? "active" : ""}
                  onClick={() => changeView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {overlaps.length > 0 && (
            <div className="conflict-note">
              <AlertTriangle size={16} />
              {overlaps.length} Terminüberschneidung(en) im sichtbaren Zeitraum. Prüfe die
              betroffenen Dienste.
            </div>
          )}
          <ErrorMessage message={error} />
          {view === "team" ? (
            <div className="table-scroll team-calendar">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    {teamDays.map((date) => (
                      <th key={date}>
                        {new Intl.DateTimeFormat("de-DE", {
                          weekday: "short",
                          day: "numeric",
                          month: "numeric",
                        }).format(new Date(`${date}T12:00:00`))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workspace.members
                    .filter((x) => isActiveStaff(x) && (!people.length || people.includes(x.id)))
                    .map((person) => (
                      <tr key={person.id}>
                        <th>{person.name}</th>
                        {teamDays.map((date) => (
                          <td key={date}>
                            {expanded
                              .filter(
                                (event) =>
                                  ids(event.extendedProps.record.data, "participantIds").includes(
                                    person.id,
                                  ) &&
                                  localDate(new Date(new Date(event.end).getTime() - 1)) >= date &&
                                  localDate(new Date(event.start)) <= date,
                              )
                              .map((event) => (
                                <button
                                  key={event.id}
                                  className="team-event"
                                  style={{ borderLeftColor: event.backgroundColor }}
                                  onClick={() => setDetail(event.extendedProps.record)}
                                >
                                  <strong>{event.title}</strong>
                                  <span>
                                    {new Intl.DateTimeFormat("de-DE", {
                                      timeZone: "Europe/Berlin",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }).format(new Date(event.start))}
                                    –
                                    {new Intl.DateTimeFormat("de-DE", {
                                      timeZone: "Europe/Berlin",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }).format(new Date(event.end))}
                                  </span>
                                </button>
                              ))}
                            {admin && (
                              <button
                                className="team-add"
                                aria-label={`Termin für ${person.name} am ${date}`}
                                onClick={() =>
                                  setEditor({
                                    kind: "events",
                                    defaults: {
                                      start: `${date}T09:00`,
                                      end: `${date}T17:00`,
                                      participantIds: [person.id],
                                    },
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
          ) : (
            <FullCalendar
              ref={calendar}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
              initialView={
                view === "week"
                  ? "timeGridWeek"
                  : view === "day"
                    ? "timeGridDay"
                    : view === "agenda"
                      ? "listMonth"
                      : "dayGridMonth"
              }
              locale={deLocale}
              timeZone="Europe/Berlin"
              firstDay={1}
              headerToolbar={false}
              height="auto"
              nowIndicator
              dayMaxEvents={3}
              selectable={admin}
              editable={admin}
              eventStartEditable={admin}
              events={expanded}
              datesSet={(info) => {
                setTitle(info.view.title);
                setExportDates((current) => {
                  const from = localDate(info.view.currentStart),
                    to = shiftDate(localDate(info.view.currentEnd), -1);
                  return current.from === from && current.to === to ? current : { from, to };
                });
                setRange((current) =>
                  current.start === info.startStr && current.end === info.endStr
                    ? current
                    : { start: info.startStr, end: info.endStr },
                );
              }}
              eventClick={(info) => setDetail(info.event.extendedProps.record as DomainRecord)}
              select={(info) => {
                const start = info.allDay ? `${localDate(info.start)}T09:00` : info.startStr;
                const end = info.allDay ? `${localDate(info.start)}T17:00` : info.endStr;
                setEditor({ kind: "events", defaults: { start, end, participantIds: people } });
              }}
              eventDrop={(info) => {
                const record = info.event.extendedProps.record as DomainRecord;
                void run(async () => {
                  try {
                    await save(
                      "events",
                      {
                        start: info.event.start?.toISOString(),
                        end: info.event.end?.toISOString(),
                      },
                      record,
                    );
                  } catch (e) {
                    info.revert();
                    throw e;
                  }
                });
              }}
              eventResize={(info) => {
                const record = info.event.extendedProps.record as DomainRecord;
                void run(async () => {
                  try {
                    await save("events", { end: info.event.end?.toISOString() }, record);
                  } catch (e) {
                    info.revert();
                    throw e;
                  }
                });
              }}
            />
          )}
        </section>
      </div>
      <section className="panel margin-top">
        <header className="panel-heading">
          <h2>{admin ? "Freiwünsche im Team" : "Meine Freiwünsche"}</h2>
          <Button onClick={() => setEditor({ kind: "leave" })}>Antrag stellen</Button>
        </header>
        {leaves.length ? (
          <div className="list">
            {leaves.map((leave) => (
              <div className="list-row" key={leave.id}>
                <div>
                  <strong>
                    {workspace.members.find((x) => x.id === leave.data.userId)?.name ||
                      "Teammitglied"}
                  </strong>
                  <p className="small muted">
                    {dateLabel(value(leave.data, "start"))} – {dateLabel(value(leave.data, "end"))}{" "}
                    · {value(leave.data, "reason")}
                  </p>
                </div>
                <Badge
                  tone={
                    leave.data.status === "approved"
                      ? "green"
                      : leave.data.status === "rejected"
                        ? "coral"
                        : "neutral"
                  }
                >
                  {statusLabels[value(leave.data, "status")]}
                </Badge>
                {leave.data.status === "pending" &&
                  (admin ? (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(() => action("leave-decide", leave.id, { status: "approved" }))
                        }
                      >
                        Genehmigen
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(() => action("leave-decide", leave.id, { status: "rejected" }))
                        }
                      >
                        Ablehnen
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={busy}
                      onClick={() => void run(() => save("leave", { status: "withdrawn" }, leave))}
                    >
                      Zurückziehen
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-inline">
            Noch keine Freiwünsche. Dein nächster freier Tag lässt sich hier anfragen.
          </p>
        )}
      </section>
      {editor && (
        <ResourceEditor
          kind={editor.kind}
          lockedProductionId={editor.kind === "events" && productionId ? productionId : undefined}
          defaults={{ productionId: project, ...editor.defaults }}
          onClose={() => setEditor(null)}
        />
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {exporting && (
        <ExportDialog
          kind="events"
          filters={{
            view,
            from: view === "team" ? teamDate : exportDates.from,
            to: view === "team" ? teamDays[6] : exportDates.to,
            ...(project ? { productionId: project } : {}),
            ...(people.length === 1
              ? { userId: people[0] }
              : people.length > 1
                ? { userIds: people.join(",") }
                : {}),
          }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
