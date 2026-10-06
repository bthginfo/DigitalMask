"use client";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import {
  initialPeriod,
  seasonBounds,
  recordMatchesPeriod,
  type PeriodFilter,
} from "@/shared/period-filter";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import deLocale from "@fullcalendar/core/locales/de";
import luxonPlugin from "@fullcalendar/luxon3";
import { occurrences } from "@/modules/calendar/occurrences";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { DomainRecord, Member } from "@/shared/contracts";
import { canManageRecord } from "@/shared/record-permissions";
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
import { calendarEventPaint } from "@/shared/calendar-paint";
import { sortCalendarStaff } from "@/shared/calendar-team";
import { sortProductionsByPremiere } from "@/shared/production-order";
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
import {
  CalendarPresentationControls,
  useCalendarPresentation,
} from "@/modules/calendar/components/calendar-presentation-controls";
import presentationStyles from "@/modules/calendar/components/calendar-presentation.module.css";
import { MobileDaySheet } from "@/modules/calendar/components/mobile-day-sheet";
import { calendarDayIndex, calendarDayLabel } from "@/modules/calendar/components/day-details";
import calendarStyles from "@/modules/calendar/components/mobile-calendar.module.css";
import { statusLabels } from "../resource-fields";
const calendarClock = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : "";
export function expandEvents(
  records: DomainRecord[],
  rangeStart: string,
  rangeEnd: string,
  productions: DomainRecord[] = [],
  categories?: DomainRecord[],
  member?: Member,
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
      background: presentation.background,
      blocksTime: presentation.blocksTime,
      start: instance.start.toISOString(),
      end: instance.end.toISOString(),
      ...calendarEventPaint(presentation.color, presentation.allDay, !!presentation.background),
      editable:
        !record.data.leaveId &&
        !presentation.background &&
        (!record.data.recurrence || record.data.recurrence === "none") &&
        (!member || canManageRecord(member, "events", record)),
      extendedProps: { record },
    }));
  });
}
export function CalendarModule({ productionId = "" }: { productionId?: string }) {
  const { workspace, save, action, busy } = useWorkspace();
  const admin = workspace.user.role !== "user";
  const calendar = useRef<FullCalendar>(null);
  const calendarRoot = useRef<HTMLDivElement>(null);
  const presentation = useCalendarPresentation(calendarRoot);
  const { exitFullscreen } = presentation;
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    initialPeriod(workspace.records.productions, productionId),
  );
  const [view, setView] = useState("month");
  const [teamSpan, setTeamSpan] = useState("week");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileDay, setMobileDay] = useState(localDate());
  const [mobileDaySheetOpen, setMobileDaySheetOpen] = useState(false);
  const filtersId = useId();
  const categoryOptions = calendarCategories(workspace);
  const [people, setPeople] = useState<string[]>(
    workspace.user.role === "superadmin" ? [] : [workspace.user.id],
  );
  const [showAll, setShowAll] = useState(false);
  const personalSelection = useRef<{ people: string[]; showAll: boolean } | null>(null);
  const staff = useMemo(
    () => sortCalendarStaff(workspace.members.filter(isActiveStaff)),
    [workspace.members],
  );
  const productions = useMemo(
    () => sortProductionsByPremiere(workspace.records.productions),
    [workspace.records.productions],
  );
  const visiblePeople = useMemo(
    () =>
      showAll
        ? staff.map((member) => member.id)
        : people.filter((id) => staff.some((member) => member.id === id)),
    [showAll, people, staff],
  );
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
  const [teamDate, setTeamDate] = useState(localDate());
  const [editor, setEditor] = useState<{
    kind: "events" | "leave";
    defaults?: Record<string, unknown>;
    record?: DomainRecord;
  } | null>(null);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (mobile && !editor && !detail && !exporting && !categoriesOpen) exitFullscreen();
  }, [mobile, editor, detail, exporting, categoriesOpen, exitFullscreen]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => calendar.current?.getApi().updateSize());
    return () => cancelAnimationFrame(frame);
  }, [presentation.collapsed, presentation.fullscreen, view]);
  useEffect(() => {
    const root = calendarRoot.current;
    if (!root) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => calendar.current?.getApi().updateSize());
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const teamStart = teamSpan === "month" ? monthStart(teamDate) : weekStart(instantDate(teamDate));
  const teamEnd = teamSpan === "month" ? shiftMonth(teamStart, 1) : shiftDate(teamStart, 7);
  const filtered = useMemo(
    () =>
      workspace.records.events.filter(
        (x) =>
          (!project || x.data.productionId === project) &&
          recordMatchesPeriod(x, { season: period.season }, workspace.records.productions) &&
          (!category || x.data.category === category) &&
          calendarEventSelected(x.data, visiblePeople, showAll),
      ),
    [
      workspace.records.events,
      workspace.records.productions,
      project,
      period.season,
      category,
      visiblePeople,
      showAll,
    ],
  );
  const expansionStart = view === "team" ? teamStart : range.start;
  const expansionEnd = view === "team" ? teamEnd : range.end;
  const expanded = useMemo(
    () =>
      expandEvents(
        filtered,
        expansionStart,
        expansionEnd,
        workspace.records.productions,
        workspace.records.calendarCategories,
        workspace.user,
      ).filter((event) => {
        const bounds = seasonBounds(period.season);
        return (
          !bounds ||
          (new Date(event.end).getTime() > instantDate(bounds.from).getTime() &&
            new Date(event.start).getTime() < instantDate(bounds.to).getTime())
        );
      }),
    [
      filtered,
      expansionStart,
      expansionEnd,
      workspace.records.productions,
      workspace.records.calendarCategories,
      workspace.user,
      period.season,
    ],
  );
  const dayEntries = useMemo(
    () =>
      calendarDayIndex(
        expanded,
        localDate(instantDate(range.start)),
        shiftDate(localDate(instantDate(range.end)), -1),
      ),
    [expanded, range.start, range.end],
  );
  const selectedDayCount = dayEntries.get(mobileDay)?.length || 0;
  const calendarEvents = useMemo(
    () =>
      expanded.map((event) => ({
        ...event,
        display:
          event.background && !event.allDay && (view === "week" || view === "day")
            ? "background"
            : "block",
        classNames: event.background ? [calendarStyles.backgroundEvent] : [],
      })),
    [expanded, view],
  );
  const openMobileDay = (day: string) => {
    setMobileDay(day);
    setMobileDaySheetOpen(true);
  };
  const overlaps = expanded.filter((event, i) =>
    expanded
      .slice(i + 1)
      .some(
        (other) =>
          calendarCategoryBlocksTime(
            value(event.extendedProps.record.data, "category"),
            workspace.records.calendarCategories,
          ) &&
          calendarCategoryBlocksTime(
            value(other.extendedProps.record.data, "category"),
            workspace.records.calendarCategories,
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
    setMobileDaySheetOpen(false);
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
    <div
      ref={calendarRoot}
      className={`calendar-module ${calendarStyles.calendar}${presentation.collapsed ? ` ${presentationStyles.collapsed}` : ""}${presentation.fullscreen ? ` ${presentationStyles.focus} calendar-focus-view` : ""}`}
      data-calendar-fullscreen={presentation.fullscreen || undefined}
    >
      <PageHeader
        eyebrow="DEIN DIENSTPLAN. GEMEINSAM GEPLANT."
        title="Kalender"
        description="Eigene Dienste, Teamkalender und freie Tage im Überblick."
      >
        <div className="calendar-desktop-actions">
          <CalendarPresentationControls
            collapsed={presentation.collapsed}
            fullscreen={presentation.fullscreen}
            filtersId={filtersId}
            onToggleFilters={presentation.toggleFilters}
            onToggleFullscreen={presentation.toggleFullscreen}
          />
          <ExportButton onClick={() => setExporting(true)} />
          {workspace.user.role !== "superadmin" && (
            <Button onClick={() => setEditor({ kind: "leave" })}>Freien Tag wünschen</Button>
          )}
          {admin && <Button onClick={() => setCategoriesOpen(true)}>Kalenderarten</Button>}
        </div>
        <Button
          variant="primary"
          onClick={() => setEditor({ kind: "events", defaults: { participantIds: visiblePeople } })}
        >
          <Plus size={16} />
          Termin
        </Button>
        <details
          ref={actionsMenu}
          className="calendar-mobile-actions"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              actionsMenu.current?.removeAttribute("open");
              actionsMenu.current?.querySelector("summary")?.focus();
            }
          }}
        >
          <summary className="button">
            Aktionen
            <ChevronDown size={14} />
          </summary>
          <div className="calendar-action-menu">
            <ExportButton
              onClick={() => {
                actionsMenu.current?.removeAttribute("open");
                setExporting(true);
              }}
            />
            {workspace.user.role !== "superadmin" && (
              <Button
                onClick={() => {
                  actionsMenu.current?.removeAttribute("open");
                  setEditor({ kind: "leave" });
                }}
              >
                Freien Tag wünschen
              </Button>
            )}
            {admin && (
              <Button
                onClick={() => {
                  actionsMenu.current?.removeAttribute("open");
                  setCategoriesOpen(true);
                }}
              >
                Kalenderarten
              </Button>
            )}
          </div>
        </details>
      </PageHeader>
      <div className="calendar-mobile-selection">
        <button
          className="calendar-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={16} />
          <span>{showAll ? "Gesamtes Team" : `${visiblePeople.length} Kalender`}</span>
          {(category || project) && (
            <span className="calendar-filter-dot" aria-label="Weitere Filter aktiv" />
          )}
        </button>
        <button
          className="calendar-all-toggle"
          aria-pressed={showAll}
          onClick={() => {
            setShowAll(!showAll);
            if (showAll) setPeople(workspace.user.role === "superadmin" ? [] : [workspace.user.id]);
          }}
        >
          {showAll ? (workspace.user.role === "superadmin" ? "Auswahl" : "Nur ich") : "Alle"}
        </button>
      </div>
      <div className="calendar-layout">
        <aside id={filtersId} className={`calendar-filters${filtersOpen ? " is-open" : ""}`}>
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
              ? "Gesamtes Team · inklusive Gäste/Aushilfen"
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
              {productions.map((x) => (
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
          <PeriodPicker
            compact
            records={workspace.records.events}
            productions={workspace.records.productions}
            value={period}
            onChange={(next) => {
              setPeriod(next);
              if (next.year && next.year !== period.year) {
                const bounds = seasonBounds(next.season);
                const date =
                  bounds && Number(bounds.from.slice(0, 4)) === next.year
                    ? bounds.from
                    : next.year + "-01-01";
                calendar.current?.getApi().gotoDate(date);
                setTeamDate(date);
              } else if (next.season && next.season !== period.season) {
                const bounds = seasonBounds(next.season);
                const today = localDate();
                const date = bounds
                  ? today >= bounds.from && today < bounds.to
                    ? today
                    : bounds.from
                  : today;
                calendar.current?.getApi().gotoDate(date);
                setTeamDate(date);
              }
            }}
          />
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
                  view === "team" ? setTeamDate(localDate()) : calendar.current?.getApi().today()
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
              mobile={mobile}
              canPlan={(person) => admin || person === workspace.user.id}
              productions={workspace.records.productions}
              suspended={!!detail || !!editor}
              canEdit={(record) => canManageRecord(workspace.user, "events", record)}
              onOpen={setDetail}
              onEdit={(record) => setEditor({ kind: "events", record })}
              onCreate={(defaults) => setEditor({ kind: "events", defaults })}
            />
          ) : (
            <>
              <FullCalendar
                ref={calendar}
                plugins={[
                  dayGridPlugin,
                  timeGridPlugin,
                  listPlugin,
                  interactionPlugin,
                  luxonPlugin,
                ]}
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
                slotMinTime="06:00:00"
                slotMaxTime="25:00:00"
                scrollTime="06:00:00"
                headerToolbar={false}
                height={presentation.fullscreen ? "100%" : "auto"}
                fixedWeekCount={!mobile}
                nowIndicator
                dayMaxEvents={mobile ? 1 : 3}
                dayCellClassNames={(info) =>
                  localDate(info.date) === mobileDay ? ["mobile-selected-day"] : []
                }
                dayCellContent={(info) => {
                  if (!mobile || view !== "month") return info.dayNumberText;
                  const day = localDate(info.date);
                  const count = dayEntries.get(day)?.length || 0;
                  return (
                    <button
                      type="button"
                      className={calendarStyles.dayButton}
                      data-calendar-day={day}
                      aria-haspopup="dialog"
                      aria-pressed={day === mobileDay}
                      aria-label={`${calendarDayLabel(day)}: ${count} ${count === 1 ? "Termin" : "Termine"}. Details anzeigen`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openMobileDay(day);
                      }}
                    >
                      {count > 1 && (
                        <span className={calendarStyles.busyCount} aria-hidden="true">
                          {count}
                        </span>
                      )}
                      <span>{info.dayNumberText}</span>
                    </button>
                  );
                }}
                moreLinkClick={(info) => {
                  if (!mobile || view !== "month") return "popover";
                  openMobileDay(localDate(info.date));
                  return "dayGridMonth";
                }}
                selectable={true}
                editable={true}
                eventStartEditable={true}
                events={calendarEvents}
                eventDisplay="block"
                selectOverlap={true}
                eventContent={(info) => {
                  if (info.event.display !== "background") return true;
                  const hours = `${calendarClock(info.event.start)}–${calendarClock(info.event.end)}`;
                  return (
                    <button
                      type="button"
                      className={calendarStyles.backgroundLabel}
                      aria-label={`${info.event.title} · ${hours} · Details anzeigen`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetail(info.event.extendedProps.record as DomainRecord);
                      }}
                    >
                      <strong>{info.event.title}</strong>
                      <span>{hours}</span>
                    </button>
                  );
                }}
                eventDidMount={(info) => {
                  if (info.event.display === "background")
                    info.el.style.setProperty(
                      "--calendar-background-border",
                      info.event.borderColor,
                    );
                }}
                datesSet={(info) => {
                  setTitle(info.view.title);
                  const firstDay = localDate(info.view.currentStart);
                  const afterLastDay = localDate(info.view.currentEnd);
                  const today = localDate();
                  setMobileDay((current) =>
                    current >= firstDay && current < afterLastDay
                      ? current
                      : today >= firstDay && today < afterLastDay
                        ? today
                        : firstDay,
                  );
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
                dateClick={(info) => {
                  const day = localDate(info.date);
                  if (mobile && view === "month") openMobileDay(day);
                  else setMobileDay(day);
                }}
                select={(info) => {
                  if (
                    info.view.type === "dayGridMonth" &&
                    window.matchMedia("(max-width: 760px)").matches
                  ) {
                    openMobileDay(localDate(info.start));
                    calendar.current?.getApi().unselect();
                    return;
                  }
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
              {view === "month" && (
                <section className={`personal-mobile-day-detail ${calendarStyles.daySummary}`}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => openMobileDay(mobileDay)}
                  >
                    <span>
                      <strong className={calendarStyles.summaryTitle}>
                        {calendarDayLabel(mobileDay)}
                      </strong>
                      <span>
                        {selectedDayCount} {selectedDayCount === 1 ? "Termin" : "Termine"} ·
                        Tagesdetails anzeigen
                      </span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </section>
              )}
              {mobile && view === "month" && mobileDaySheetOpen && !detail && !editor && (
                <MobileDaySheet
                  events={expanded}
                  day={mobileDay}
                  members={workspace.members}
                  productions={workspace.records.productions}
                  contextLabel={
                    showAll
                      ? "Gesamtes Team"
                      : `${visiblePeople.length} ${visiblePeople.length === 1 ? "Kalender" : "Kalender ausgewählt"}`
                  }
                  minDay={localDate(instantDate(range.start))}
                  maxDay={shiftDate(localDate(instantDate(range.end)), -1)}
                  createOptions={[
                    {
                      id: "selected-calendars",
                      label: "Termin an diesem Tag",
                      participantIds: admin ? visiblePeople : [workspace.user.id],
                    },
                  ]}
                  canEdit={(record) => canManageRecord(workspace.user, "events", record)}
                  onSelect={setMobileDay}
                  onClose={() => setMobileDaySheetOpen(false)}
                  onRestoreFocus={() =>
                    calendarRoot.current
                      ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${mobileDay}"]`)
                      ?.focus({ preventScroll: true })
                  }
                  onOpen={setDetail}
                  onEdit={(record) => setEditor({ kind: "events", record })}
                  onCreate={(defaults) => setEditor({ kind: "events", defaults })}
                />
              )}
            </>
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
          record={editor.record}
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
    </div>
  );
}
