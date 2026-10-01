"use client";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import { recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { useRef, useState } from "react";
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
import {
  dateLabel,
  ids,
  localDate,
  instantDate,
  shiftDate,
  value,
  weekStart,
} from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { calendarEventSelected } from "@/shared/calendar-selection";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
import { calendarPresentation, calendarCategoryBlocksTime } from "@/shared/calendar-categories";
import {
  calendarCategories,
  monthStart,
  shiftMonth,
} from "@/modules/calendar/components/client-calendar";
import { CalendarCategoriesDialog } from "@/modules/calendar/components/categories-dialog";
import { TeamCalendar } from "@/modules/calendar/components/team-calendar";
import { statusLabels } from "../resource-fields";
export function expandEvents(
  records: DomainRecord[],
  rangeStart: string,
  rangeEnd: string,
  productions: DomainRecord[] = [],
  categories?: DomainRecord[],
) {
  return records.flatMap((record) => {
    if (
      !Number.isFinite(new Date(value(record.data, "start")).getTime()) ||
      !Number.isFinite(new Date(value(record.data, "end")).getTime())
    )
      return [];
    const presentation = calendarPresentation(record, productions, categories);
    return occurrences(record, new Date(rangeStart), new Date(rangeEnd)).map((instance) => ({
      id: `${record.id}:${instance.start.toISOString()}`,
      title: presentation.title,
      allDay: presentation.allDay,
      categoryName: presentation.categoryName,
      start: instance.start.toISOString(),
      end: instance.end.toISOString(),
      backgroundColor: presentation.color,
      borderColor: "transparent",
      editable:
        !record.data.leaveId && (!record.data.recurrence || record.data.recurrence === "none"),
      extendedProps: { record },
    }));
  });
}
export function CalendarModule({ productionId = "" }: { productionId?: string }) {
  const { workspace, save, action, busy } = useWorkspace();
  const admin = workspace.user.role !== "user";
  const calendar = useRef<FullCalendar>(null);
  const [period, setPeriod] = useState<PeriodFilter>({});
  const [view, setView] = useState("month");
  const [teamSpan, setTeamSpan] = useState("week");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoryOptions = calendarCategories(workspace);
  const [people, setPeople] = useState<string[]>(
    workspace.user.role === "superadmin" ? [] : [workspace.user.id],
  );
  const [showAll, setShowAll] = useState(false);
  const personalSelection = useRef<{ people: string[]; showAll: boolean } | null>(null);
  const staff = workspace.members.filter(isActiveStaff);
  const visiblePeople = showAll
    ? staff.map((member) => member.id)
    : people.filter((id) => staff.some((member) => member.id === id));
  const [category, setCategory] = useState("");
  const [leaveCategories, setLeaveCategories] = useState<Record<string, string>>({});
  const absenceCategories = categoryOptions.filter((option) => option.allDay);
  const defaultLeaveCategory =
    absenceCategories.find((option) => option.key === "absence")?.key ||
    absenceCategories.find((option) => option.key === "vacation")?.key ||
    "";
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
  const teamStart = teamSpan === "month" ? monthStart(teamDate) : teamDate;
  const teamEnd = teamSpan === "month" ? shiftMonth(teamStart, 1) : shiftDate(teamStart, 7);
  const filtered = workspace.records.events.filter(
    (x) =>
      (!project || x.data.productionId === project) &&
      recordMatchesPeriod(x, { season: period.season }, workspace.records.productions) &&
      (!category || x.data.category === category) &&
      calendarEventSelected(x.data, visiblePeople, showAll),
  );
  const expanded = expandEvents(
    filtered,
    view === "team" ? teamStart : range.start,
    view === "team" ? teamEnd : range.end,
    workspace.records.productions,
    workspace.records.calendarCategories,
  );
  const overlaps = expanded.filter((event, i) =>
    expanded
      .slice(i + 1)
      .some(
        (other) =>
          !(
            event.allDay &&
            !calendarCategoryBlocksTime(
              value(event.extendedProps.record.data, "category"),
              workspace.records.calendarCategories,
            )
          ) &&
          !(
            other.allDay &&
            !calendarCategoryBlocksTime(
              value(other.extendedProps.record.data, "category"),
              workspace.records.calendarCategories,
            )
          ) &&
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
    if (next === "team" && view !== "team") {
      personalSelection.current = { people, showAll };
      setShowAll(true);
    } else if (next !== "team" && view === "team" && personalSelection.current) {
      setPeople(personalSelection.current.people);
      setShowAll(personalSelection.current.showAll);
      personalSelection.current = null;
    }
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
  const teamDays = Array.from(
    {
      length: Math.round(
        (new Date(`${teamEnd}T12:00:00Z`).getTime() -
          new Date(`${teamStart}T12:00:00Z`).getTime()) /
          86400000,
      ),
    },
    (_, i) => shiftDate(teamStart, i),
  );
  return (
    <>
      <PageHeader
        eyebrow="DEIN DIENSTPLAN. GEMEINSAM GEPLANT."
        title="Kalender"
        description="Eigene Dienste, Teamkalender und freie Tage im Überblick."
      >
        <ExportButton onClick={() => setExporting(true)} />
        {workspace.user.role !== "superadmin" && (
          <Button onClick={() => setEditor({ kind: "leave" })}>Freien Tag wünschen</Button>
        )}
        {admin && <Button onClick={() => setCategoriesOpen(true)}>Kalenderarten</Button>}
        {admin && (
          <Button
            variant="primary"
            onClick={() =>
              setEditor({ kind: "events", defaults: { participantIds: visiblePeople } })
            }
          >
            <Plus size={16} />
            Termin
          </Button>
        )}
      </PageHeader>
      <PeriodPicker
        records={workspace.records.events}
        productions={workspace.records.productions}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          if (next.year && next.year !== period.year) {
            const date = next.year + "-01-01";
            calendar.current?.getApi().gotoDate(date);
            setTeamDate(teamSpan === "month" ? monthStart(date) : weekStart(instantDate(date)));
          }
        }}
      />
      <div className="calendar-layout">
        <aside className="calendar-filters">
          <h3>Kalender einblenden</h3>
          {workspace.user.role !== "superadmin" && (
            <button
              className="text-button"
              onClick={() => {
                setShowAll(false);
                setPeople([workspace.user.id]);
              }}
            >
              Nur meinen Kalender
            </button>
          )}
          <button
            className="text-button"
            aria-pressed={showAll}
            onClick={() => {
              setShowAll(!showAll);
              if (showAll)
                setPeople(workspace.user.role === "superadmin" ? [] : [workspace.user.id]);
            }}
          >
            Alle anzeigen
          </button>
          {staff.map((member) => (
            <label className="check-label" key={member.id}>
              <input
                type="checkbox"
                checked={visiblePeople.includes(member.id)}
                onChange={(event) => {
                  setShowAll(false);
                  setPeople(
                    event.target.checked
                      ? [...visiblePeople, member.id]
                      : visiblePeople.filter((x) => x !== member.id),
                  );
                }}
              />
              <span className="calendar-person">
                {member.name}
                {member.id === workspace.user.id && <span className="small muted"> (ich)</span>}
              </span>
            </label>
          ))}
          <p className="small muted" aria-live="polite">
            {showAll
              ? "Gesamtes Team · inklusive Terminen ohne Personenzuordnung"
              : visiblePeople.length
                ? `${visiblePeople.length} Kalender ausgewählt`
                : "Kein Kalender ausgewählt. Wähle eine Person oder Alle anzeigen."}
          </p>
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
              {categoryOptions.map(({ key, name }) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="calendar-legend">
            {categoryOptions.map(({ key, color, name }) => (
              <span key={key}>
                <i style={{ background: color }} />
                {name}
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
                    ? setTeamDate(
                        teamSpan === "month" ? shiftMonth(teamDate, -1) : shiftDate(teamDate, -7),
                      )
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
                    ? setTeamDate(
                        teamSpan === "month" ? shiftMonth(teamDate, 1) : shiftDate(teamDate, 7),
                      )
                    : calendar.current?.getApi().next()
                }
              >
                <ChevronRight size={18} />
              </button>
              <Button
                onClick={() =>
                  view === "team"
                    ? setTeamDate(teamSpan === "month" ? monthStart(localDate()) : weekStart())
                    : calendar.current?.getApi().today()
                }
              >
                Heute
              </Button>
              <h2>
                {view === "team"
                  ? teamSpan === "month"
                    ? new Intl.DateTimeFormat("de-DE", {
                        timeZone: "Europe/Berlin",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(`${teamStart}T12:00:00Z`))
                    : `Woche ab ${dateLabel(teamStart)}`
                  : title}
              </h2>
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
          {view === "team" && (
            <div className="team-span-controls segmented" aria-label="Teamzeitraum">
              {[
                ["week", "Teamwoche"],
                ["month", "Teammonat"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={teamSpan === key ? "active" : ""}
                  onClick={() => {
                    setTeamSpan(key);
                    setTeamDate(
                      key === "month" ? monthStart(teamDate) : weekStart(instantDate(teamDate)),
                    );
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {overlaps.length > 0 && (
            <div className="conflict-note">
              <AlertTriangle size={16} />
              {overlaps.length} Terminüberschneidung(en) im sichtbaren Zeitraum. Prüfe die
              betroffenen Dienste.
            </div>
          )}
          <ErrorMessage message={error} />
          {view === "team" ? (
            <TeamCalendar
              events={expanded}
              members={workspace.members}
              people={visiblePeople}
              days={teamDays}
              month={teamSpan === "month"}
              admin={admin}
              productions={workspace.records.productions}
              onOpen={setDetail}
              onCreate={(defaults) => setEditor({ kind: "events", defaults })}
            />
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
                setEditor({
                  kind: "events",
                  defaults: { start, end, participantIds: visiblePeople },
                });
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
          {workspace.user.role !== "superadmin" && (
            <Button onClick={() => setEditor({ kind: "leave" })}>Antrag stellen</Button>
          )}
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
                      <label className="leave-category-picker">
                        Als Kalenderart
                        <select
                          value={leaveCategories[leave.id] ?? defaultLeaveCategory}
                          onChange={(event) =>
                            setLeaveCategories({
                              ...leaveCategories,
                              [leave.id]: event.target.value,
                            })
                          }
                        >
                          <option value="">Ganztägige Art wählen</option>
                          {absenceCategories.map((option) => (
                            <option value={option.key} key={option.key}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        disabled={busy || !(leaveCategories[leave.id] ?? defaultLeaveCategory)}
                        onClick={() =>
                          void run(() =>
                            action("leave-decide", leave.id, {
                              status: "approved",
                              category: leaveCategories[leave.id] ?? defaultLeaveCategory,
                            }),
                          )
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
      {categoriesOpen && <CalendarCategoriesDialog onClose={() => setCategoriesOpen(false)} />}
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
            ...periodExportFilters(period),
            view: view === "team" && teamSpan === "month" ? "team-month" : view,
            from: view === "team" ? teamStart : exportDates.from,
            to: view === "team" ? teamDays[teamDays.length - 1] : exportDates.to,
            ...(project ? { productionId: project } : {}),
            ...(!showAll ? { userIds: visiblePeople.join(",") } : {}),
            ...(category ? { category } : {}),
          }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
