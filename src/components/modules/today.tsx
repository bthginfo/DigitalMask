"use client";
import { useState } from "react";
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
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, PageHeader, Section } from "../ui";
import { RecordDetail } from "../resource-view";
import { TimerPanel } from "./time";
import { expandEvents } from "./calendar";
import { statusLabels } from "../resource-fields";
import { initialPeriod, recordMatchesPeriod } from "@/shared/period-filter";
export function TodayModule({ navigate }: { navigate: (module: string) => void }) {
  const { workspace, action, notify } = useWorkspace();
  const showTimer = isStaff(workspace.user);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [now] = useState(Date.now);
  const today = localDate(new Date(now));
  const week = weekStart();
  const weekEnd = shiftDate(week, 6);
  const myTasks = workspace.records.tasks.filter(
    (x) =>
      ids(x.data, "assigneeIds").includes(workspace.user.id) &&
      x.data.status !== "done" &&
      recordMatchesPeriod(
        x,
        initialPeriod(workspace.records.productions),
        workspace.records.productions,
      ),
  );
  const upcomingEvents = expandEvents(
    workspace.records.events.filter((x) =>
      ids(x.data, "participantIds").includes(workspace.user.id),
    ),
    `${today}T00:00:00`,
    new Date(now + 7 * 86400000).toISOString(),
    workspace.records.productions,
    workspace.records.calendarCategories,
  )
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((x) => new Date(x.end).getTime() >= now);
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
  const notices = workspace.records.notifications.filter(
    (x) => !x.data.read && x.data.userId === workspace.user.id,
  );
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("de-DE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
          .format(new Date())
          .toUpperCase()}
        title={`${greet}, ${workspace.user.name.split(" ")[0]}.`}
        description="Dein Tag hinter der Bühne. Alles Wichtige an einem Ort."
      >
        <Button variant="primary" onClick={() => navigate("time")}>
          <Clock3 size={16} />
          Zeit buchen
        </Button>
      </PageHeader>
      <div className="today-summary">
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
      </div>
      <div className={`today-layout${showTimer ? " today-layout--with-timer" : ""}`}>
        <div className="today-main">
          <div className="today-notifications">
            <Section title="Neu für dich" meta={`${notices.length} ungelesene Mitteilungen`}>
              {notices.length ? (
                <div className="list">
                  {notices.slice(0, 6).map((notice) => (
                    <button
                      key={notice.id}
                      className="notification-row"
                      onClick={async () => {
                        try {
                          await action("notification-read", notice.id);
                          const link = value(notice.data, "link");
                          if (link.startsWith("/?") || link.startsWith("/")) location.href = link;
                        } catch (e) {
                          notify(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
                        }
                      }}
                    >
                      <span className="notice-dot" />
                      <div>
                        <strong>{value(notice.data, "title")}</strong>
                        <p className="small muted">{value(notice.data, "body")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">
                  <Sparkles size={18} />
                  Alles auf dem neuesten Stand.
                </p>
              )}
            </Section>
          </div>
          <Section
            title="Als Nächstes"
            meta="Dein persönlicher Kalender"
            action={() => navigate("calendar")}
          >
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
                      <span>
                        {new Intl.DateTimeFormat("de-DE", {
                          timeZone: "Europe/Berlin",
                          weekday: "short",
                        }).format(new Date(event.start))}
                      </span>
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
                          : `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(event.start))}–${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(event.end))}`}{" "}
                        · {value(event.extendedProps.record.data, "location") || "Ort noch offen"}
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
            meta="Was als Nächstes ansteht"
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
