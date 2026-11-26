"use client";
import { berlinClock, dateFormat } from "@/shared/intl";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Sparkles,
} from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  ids,
  localDate,
  shiftDate,
  timeAllocations,
  value,
  weekStart,
} from "@/shared/client-api";
import { recordHref } from "@/shared/client-navigation";
import { isStaff } from "@/shared/client-members";
import { useWorkspaceData } from "../workspace-context";
import { Badge, Button, Empty, PageHeader, Section } from "../ui";
import { RecordDetail } from "../lazy-modules";
import { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { expandEvents } from "@/modules/calendar/expand";
import { calendarProductionRecords } from "@/shared/calendar-access";
import { statusLabels } from "../resource-fields";
import { initialPeriod, recordMatchesPeriod } from "@/shared/period-filter";
import { unreadNotifications } from "@/modules/notifications/unread";
import { MarkAllReadButton } from "@/modules/notifications/components/mark-all-read";
import { NotificationRow } from "@/modules/notifications/components/notification-row";
import {
  AttendanceBalanceCard,
  attendanceBalanceStyles,
} from "@/modules/time-tracking/components/attendance-balance";
const todayHeading = dateFormat({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekdayShort = dateFormat({ timeZone: "Europe/Berlin", weekday: "short" });
export function TodayModule({ navigate }: { navigate: (module: string) => void }) {
  const workspace = useWorkspaceData();
  const showTimer = isStaff(workspace.user);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [now] = useState(Date.now);
  const today = localDate(new Date(now));
  const week = weekStart();
  const weekEnd = shiftDate(week, 6);
  const userId = workspace.user.id;
  const { productions, tasks, events, calendarCategories } = workspace.records;
  const calendarProductions = calendarProductionRecords(workspace);
  // Heute re-renders for every workspace update; only recompute when its inputs change.
  const myTasks = useMemo(() => {
    const period = initialPeriod(productions);
    return tasks.filter(
      (x) =>
        ids(x.data, "assigneeIds").includes(userId) &&
        x.data.status !== "done" &&
        recordMatchesPeriod(x, period, productions),
    );
  }, [tasks, productions, userId]);
  const upcomingEvents = useMemo(
    () =>
      expandEvents(
        events.filter((x) => ids(x.data, "participantIds").includes(userId)),
        `${today}T00:00:00`,
        new Date(now + 7 * 86400000).toISOString(),
        calendarProductions,
        calendarCategories,
      )
        .sort((a, b) => a.start.localeCompare(b.start))
        .filter((x) => new Date(x.end).getTime() >= now),
    [events, userId, today, now, calendarProductions, calendarCategories],
  );
  const myEvents = upcomingEvents.slice(0, 5);
  const performances = upcomingEvents.filter(
    (event) =>
      event.extendedProps.record.data.category === "performance" &&
      new Date(event.start).getTime() >= now,
  );
  const attendanceDays = (workspace.records.attendance || [])
    .filter((x) => x.data.userId === workspace.user.id)
    .flatMap((x) => timeAllocations(x.data));
  const total = attendanceDays
    .filter((day) => day.date >= week && day.date <= weekEnd)
    .reduce((sum, day) => sum + day.seconds, 0);
  const notices = unreadNotifications(workspace.records.notifications, workspace.user.id);
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  return (
    <>
      <PageHeader
        eyebrow={todayHeading.format(new Date())}
        title={`${greet}, ${workspace.user.name.split(" ")[0]}.`}
        compact
      >
        <Button variant="primary" onClick={() => navigate("time")}>
          <Clock3 size={16} />
          Zeit buchen
        </Button>
      </PageHeader>
      <div
        className={`today-summary${showTimer ? ` ${attendanceBalanceStyles.dashboardSummary}` : ""}`}
      >
        <button
          onClick={() =>
            navigate(myTasks.some((task) => task.data.productionId) ? "productions" : "tasks")
          }
        >
          <span className="summary-icon">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <strong>{myTasks.length}</strong>
            <span>offene Aufgaben</span>
          </div>
          <ChevronRight size={17} />
        </button>
        <button onClick={() => navigate("calendar")}>
          <span className="summary-icon blue">
            <CalendarDays size={21} />
          </span>
          <div>
            <strong>{performances.length}</strong>
            <span>Vorstellungen (7 Tage)</span>
          </div>
          <ChevronRight size={17} />
        </button>
        <div className="hours-summary">
          <button
            className="summary-hours-action"
            onClick={() => navigate("time")}
            aria-label={`Anwesenheit diese Woche: ${hours(total)} Stunden. Anwesenheit öffnen`}
          >
            <span className="summary-icon coral">
              <Clock3 size={21} />
            </span>
            <div aria-live="polite">
              <strong>
                {hours(total)} <small>h</small>
              </strong>
              <span>Anwesenheit diese Woche</span>
            </div>
            <ChevronRight size={17} />
          </button>
        </div>
        {showTimer && <AttendanceBalanceCard compact onOpenSettings={() => navigate("settings")} />}
      </div>
      <div className={`today-layout${showTimer ? " today-layout--with-timer" : ""}`}>
        <div className="today-main">
          <div className="today-notifications">
            {notices.length ? (
              <Section title="Neu für dich" meta={`${notices.length} ungelesene Mitteilungen`}>
                <MarkAllReadButton />
                <div className="list">
                  {notices.slice(0, 6).map((notice) => (
                    <NotificationRow key={notice.id} notice={notice} navigate={navigate} />
                  ))}
                </div>
              </Section>
            ) : (
              <section className="panel notifications-clear">
                <Sparkles size={18} aria-hidden="true" />
                <h2>Neu für dich</h2>
                <span>Alles gelesen</span>
              </section>
            )}
          </div>
          <Section title="Als Nächstes" action={() => navigate("calendar")}>
            {myEvents.length ? (
              <div className="schedule-list">
                {myEvents.map((event) => (
                  <button
                    key={event.id}
                    className="schedule-row"
                    onClick={() => setDetail(event.extendedProps.record)}
                  >
                    <div className="schedule-date">
                      <strong>{Number(localDate(new Date(event.start)).slice(8))}</strong>
                      <span>{weekdayShort.format(new Date(event.start))}</span>
                    </div>
                    <div className="schedule-info">
                      <Badge
                        tone={
                          event.extendedProps.record.data.category === "performance"
                            ? "coral"
                            : "green"
                        }
                      >
                        {event.categoryName}
                      </Badge>
                      <h3>{event.title}</h3>
                      <p className="small muted">
                        {event.allDay
                          ? "Ganztägig"
                          : `${berlinClock.format(new Date(event.start))}–${berlinClock.format(new Date(event.end))}`}{" "}
                        {value(event.extendedProps.record.data, "location") &&
                          ` · ${value(event.extendedProps.record.data, "location")}`}
                      </p>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Dein Kalender hat noch Luft."
                description="Sobald Dienste oder Termine für dich geplant sind, findest du sie hier."
                action="Kalender öffnen"
                onAction={() => navigate("calendar")}
              />
            )}
          </Section>
          <Section
            title="Deine Aufgaben"
            action={() =>
              navigate(myTasks.some((task) => task.data.productionId) ? "productions" : "tasks")
            }
          >
            {myTasks.length ? (
              <div className="list">
                {myTasks.slice(0, 6).map((task) => (
                  <button
                    className="task-list-row"
                    key={task.id}
                    onClick={() => navigate(recordHref(task))}
                  >
                    <span className={`status-dot ${value(task.data, "status")}`} />
                    <div>
                      <strong>{value(task.data, "title")}</strong>
                      <p className="small muted">
                        {(workspace.records.productions.find((x) => x.id === task.data.productionId)
                          ?.data.title as string) || "Teamboard"}
                        {task.data.due ? ` · bis ${dateLabel(value(task.data, "due"))}` : ""}
                      </p>
                    </div>
                    <Badge tone={task.data.priority === "high" ? "coral" : "neutral"}>
                      {task.data.priority === "high"
                        ? "Hoch"
                        : statusLabels[value(task.data, "status")]}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Aktuell nichts offen."
                description="Neue Aufgaben, die dir zugeteilt werden, erscheinen hier. Im Board findest du alle Aufgaben eurer Produktionen."
                action="Zum Aufgabenboard"
                onAction={() => navigate("tasks")}
              />
            )}
          </Section>
        </div>
        {showTimer && (
          <aside className="today-aside">
            <TimerPanel compact />
          </aside>
        )}
      </div>
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
