"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  CalendarHeart,
  ChevronRight,
  Clapperboard,
  DoorOpen,
  MessageCircle,
  Package,
  Pause,
  Play,
  Square,
  UserPlus,
} from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  ids,
  localDate,
  num,
  shiftDate,
  timeAllocations,
  value,
  weekStart,
} from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { recordHref } from "@/shared/client-navigation";
import { calendarProductionRecords } from "@/shared/calendar-access";
import { backstageChangesSection } from "@/shared/document-sections";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, PageHeader } from "@/components/ui";
import { RecordDetail } from "@/components/resource-view";
import { expandEvents } from "@/components/modules/calendar";
import { unreadNotifications } from "@/modules/notifications/unread";
import { MarkAllReadButton } from "@/modules/notifications/components/mark-all-read";
import { NotificationRow } from "@/modules/notifications/components/notification-row";
import { AttendanceBalanceCard } from "@/modules/time-tracking/components/attendance-balance";
import { chatUnreadSummary } from "./chat-unread";
import styles from "./my-day.module.css";

const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});
const berlinWeekday = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short" });
const longDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const clock = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}`;

function timerSeconds(timer: { data: DomainRecord["data"] } | null | undefined, now: number) {
  if (!timer) return 0;
  const end = timer.data.pausedAt ? new Date(String(timer.data.pausedAt)).getTime() : now;
  return Math.max(
    0,
    Math.floor((end - new Date(String(timer.data.startedAt)).getTime()) / 1000) -
      num(timer.data, "pauseSeconds"),
  );
}

/** "Mein Tag": what a make-up artist needs first when opening the app. */
export function MyDay({ navigate }: { navigate: (target: string) => void }) {
  const { workspace } = useWorkspace();
  const staff = isStaff(workspace.user);
  const admin = workspace.user.role !== "user";
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [now] = useState(Date.now);
  const today = localDate(new Date(now));
  const hour = new Date(now).getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const productions = workspace.records.productions;
  const productionTitle = (id: unknown) =>
    value(productions.find((item) => item.id === id)?.data || {}, "title");

  const events = useMemo(
    () =>
      expandEvents(
        workspace.records.events.filter((event) =>
          ids(event.data, "participantIds").includes(workspace.user.id),
        ),
        `${today}T00:00:00`,
        new Date(now + 8 * 86400000).toISOString(),
        calendarProductionRecords(workspace),
        workspace.records.calendarCategories,
      ).sort((a, b) => a.start.localeCompare(b.start)),
    [workspace, today, now],
  );
  const todays = events.filter((event) => localDate(new Date(event.start)) === today);
  const upcoming = events
    .filter((event) => localDate(new Date(event.start)) > today)
    .slice(0, 4);

  const myTasks = useMemo(
    () =>
      workspace.records.tasks
        .filter(
          (task) =>
            ids(task.data, "assigneeIds").includes(workspace.user.id) &&
            task.data.status !== "done",
        )
        .sort(
          (a, b) =>
            (value(a.data, "due") || "9999").localeCompare(value(b.data, "due") || "9999") ||
            Number(b.data.priority === "high") - Number(a.data.priority === "high"),
        ),
    [workspace.records.tasks, workspace.user.id],
  );

  const week = weekStart();
  const weekEnd = shiftDate(week, 6);
  const attendanceWeek = useMemo(
    () =>
      (workspace.records.attendance || [])
        .filter((record) => record.data.userId === workspace.user.id)
        .flatMap((record) => timeAllocations(record.data))
        .filter((day) => day.date >= week && day.date <= weekEnd)
        .reduce((sum, day) => sum + day.seconds, 0),
    [workspace.records.attendance, workspace.user.id, week, weekEnd],
  );

  const chats = chatUnreadSummary(workspace);
  const notices = unreadNotifications(workspace.records.notifications, workspace.user.id).filter(
    (notice) => !chats.isChatNotice(notice),
  );

  const inbox = admin
    ? [
        {
          key: "leave",
          icon: CalendarHeart,
          count: workspace.records.leave.filter((item) => item.data.status === "pending").length,
          label: (n: number) => (n === 1 ? "Freiwunsch wartet" : "Freiwünsche warten"),
          href: "/?module=calendar&section=leave",
        },
        {
          key: "swaps",
          icon: ArrowLeftRight,
          count: (workspace.records.shiftSwaps || []).filter(
            (item) => item.data.status === "awaiting_admin",
          ).length,
          label: (n: number) => (n === 1 ? "Diensttausch zur Freigabe" : "Diensttausche zur Freigabe"),
          href: "/?module=calendar&section=leave",
        },
        {
          key: "members",
          icon: UserPlus,
          count: workspace.members.filter((member) => member.status === "pending").length,
          label: (n: number) => (n === 1 ? "neue Registrierung" : "neue Registrierungen"),
          href: "/?module=settings",
        },
        {
          key: "materials",
          icon: Package,
          count: workspace.records.materials.filter(
            (item) => num(item.data, "minQuantity") > 0 && num(item.data, "quantity") < num(item.data, "minQuantity"),
          ).length,
          label: (n: number) => (n === 1 ? "Material unter Mindestbestand" : "Materialien unter Mindestbestand"),
          href: "/?module=inventory",
        },
      ].filter((item) => item.count > 0)
    : [];

  const productionLinks = (productionId: string, start?: string) => {
    const mask = new URLSearchParams({ module: "productions", productionId, tab: "mask-plan" });
    if (start) mask.set("showStart", new Date(start).toISOString());
    return [
      { label: "Maskenplan", href: `/?${mask}` },
      {
        label: "Umzüge",
        href: `/?module=productions&productionId=${encodeURIComponent(productionId)}&tab=${backstageChangesSection.key}`,
      },
      { label: "Chat", href: `/?module=chat&productionId=${encodeURIComponent(productionId)}` },
    ];
  };

  return (
    <>
      <PageHeader
        eyebrow={longDate.format(new Date(now))}
        title={`${greet}, ${workspace.user.name.split(" ")[0]}.`}
        compact
      />
      <div className={styles.grid}>
        <div className={styles.column}>
          {staff && <AttendanceCard navigate={navigate} />}
          {inbox.length > 0 && (
            <section className={`panel ${styles.card}`} data-whats-new="admin-inbox">
              <header className={styles.cardHead}>
                <h2>Zu erledigen</h2>
              </header>
              <ul className={`${styles.rows} ${styles.wrap}`}>
                {inbox.map(({ key, icon: Icon, count, label, href }) => (
                  <li key={key}>
                    <a
                      className={styles.row}
                      href={href}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        navigate(href);
                      }}
                    >
                      <span className={`${styles.rowIcon} ${styles.coral}`}>
                        <Icon size={18} />
                      </span>
                      <span className={styles.rowText}>
                        <strong>
                          {count} {label(count)}
                        </strong>
                      </span>
                      <ChevronRight size={18} className={styles.chevron} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={`panel ${styles.card}`} data-whats-new="today-plan">
            <header className={styles.cardHead}>
              <h2>Heute</h2>
              <button type="button" className="text-button" onClick={() => navigate("calendar")}>
                Kalender
              </button>
            </header>
            {todays.length ? (
              <ul className={styles.rows}>
                {todays.map((event) => {
                  const record = event.extendedProps.record;
                  const productionId = value(record.data, "productionId");
                  const performance = record.data.category === "performance";
                  return (
                    <li key={event.id} className={performance ? styles.performance : undefined}>
                      <button type="button" className={styles.row} onClick={() => setDetail(record)}>
                        <span className={`${styles.rowIcon} ${performance ? styles.coral : ""}`}>
                          {performance ? <Clapperboard size={18} /> : <CalendarDays size={18} />}
                        </span>
                        <span className={styles.rowText}>
                          <strong>{event.title}</strong>
                          <span>
                            {event.allDay
                              ? "Ganztägig"
                              : `${berlinTime.format(new Date(event.start))}–${berlinTime.format(new Date(event.end))}`}
                            {value(record.data, "location") && ` · ${value(record.data, "location")}`}
                          </span>
                        </span>
                        <Badge tone={performance ? "coral" : "green"}>{event.categoryName}</Badge>
                      </button>
                      {productionId && !event.allDay && (
                        <nav className={styles.quickLinks} aria-label={`Zu ${event.title}`}>
                          {productionLinks(productionId, performance ? event.start : undefined).map(
                            (link) => (
                              <a
                                key={link.label}
                                href={link.href}
                                onClick={(clickEvent) => {
                                  if (clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey)
                                    return;
                                  clickEvent.preventDefault();
                                  navigate(link.href);
                                }}
                              >
                                {link.label}
                              </a>
                            ),
                          )}
                        </nav>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.empty}>Heute ist nichts für dich eingeplant.</p>
            )}
            {upcoming.length > 0 && (
              <>
                <h3 className={styles.subhead}>Als Nächstes</h3>
                <ul className={styles.rows}>
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className={styles.row}
                        onClick={() => setDetail(event.extendedProps.record)}
                      >
                        <span className={styles.dateChip}>
                          <small>{berlinWeekday.format(new Date(event.start))}</small>
                          {Number(localDate(new Date(event.start)).slice(8))}
                        </span>
                        <span className={styles.rowText}>
                          <strong>{event.title}</strong>
                          <span>
                            {event.allDay
                              ? "Ganztägig"
                              : `${berlinTime.format(new Date(event.start))}–${berlinTime.format(new Date(event.end))}`}
                          </span>
                        </span>
                        <ChevronRight size={18} className={styles.chevron} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
        <div className={styles.column}>
          {chats.channels.length > 0 && (
            <section className={`panel ${styles.card}`}>
              <header className={styles.cardHead}>
                <h2>Ungelesen im Chat</h2>
              </header>
              <ul className={styles.rows}>
                {chats.channels.slice(0, 5).map((channel) => (
                  <li key={channel.href}>
                    <a
                      className={styles.row}
                      href={channel.href}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                        event.preventDefault();
                        navigate(channel.href);
                      }}
                    >
                      <span className={`${styles.rowIcon} ${styles.blue}`}>
                        <MessageCircle size={18} />
                      </span>
                      <span className={styles.rowText}>
                        <strong>{channel.title}</strong>
                      </span>
                      <span className={styles.count}>{channel.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={`panel ${styles.card}`}>
            <header className={styles.cardHead}>
              <h2>Meine Aufgaben</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("/?module=tasks&view=mine")}
              >
                Alle
              </button>
            </header>
            {myTasks.length ? (
              <ul className={styles.rows}>
                {myTasks.slice(0, 5).map((task) => {
                  const due = value(task.data, "due");
                  const overdue = due && due < today;
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        className={styles.row}
                        onClick={() => navigate(recordHref(task))}
                      >
                        <span
                          className={styles.dot}
                          style={{
                            background: value(
                              productions.find((item) => item.id === task.data.productionId)?.data ||
                                {},
                              "color",
                            ) || "var(--muted)",
                          }}
                        />
                        <span className={styles.rowText}>
                          <strong>{value(task.data, "title")}</strong>
                          <span className={overdue ? styles.overdue : undefined}>
                            {productionTitle(task.data.productionId) || "Allgemein"}
                            {due ? ` · bis ${dateLabel(due)}` : ""}
                          </span>
                        </span>
                        <ChevronRight size={18} className={styles.chevron} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.empty}>Neue Aufgaben, die dir zugeteilt werden, erscheinen hier.</p>
            )}
          </section>
          {staff && (
            <section className={`panel ${styles.card}`}>
              <header className={styles.cardHead}>
                <h2>Diese Woche</h2>
                <button type="button" className="text-button" onClick={() => navigate("time")}>
                  Zeiten
                </button>
              </header>
              <div className={styles.weekStats}>
                <div>
                  <strong>{hours(attendanceWeek)} h</strong>
                  <span>Anwesenheit</span>
                </div>
                <div>
                  <strong>
                    {
                      events.filter(
                        (event) =>
                          event.extendedProps.record.data.category === "performance" &&
                          localDate(new Date(event.start)) <= weekEnd,
                      ).length
                    }
                  </strong>
                  <span>Vorstellungen</span>
                </div>
              </div>
              <AttendanceBalanceCard compact onOpenSettings={() => navigate("settings")} />
            </section>
          )}
          {notices.length > 0 && (
            <section className={`panel ${styles.card}`}>
              <header className={styles.cardHead}>
                <h2>Mitteilungen</h2>
                <MarkAllReadButton />
              </header>
              <div className="list">
                {notices.slice(0, 4).map((notice) => (
                  <NotificationRow key={notice.id} notice={notice} navigate={navigate} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function AttendanceCard({ navigate }: { navigate: (target: string) => void }) {
  const { workspace, action, busy, notify } = useWorkspace();
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const attendance = workspace.attendanceTimer;
  const work = workspace.timer;
  useEffect(() => {
    if (!(attendance && !attendance.data.pausedAt) && !(work && !work.data.pausedAt)) return;
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [attendance, work]);
  const run = async (operation: "start" | "pause" | "resume" | "stop") => {
    setError("");
    try {
      await action(
        `attendance-timer-${operation}`,
        undefined,
        operation === "start" ? { title: "Anwesenheit" } : {},
      );
      setNow(Date.now());
      if (operation === "stop") notify?.("Anwesenheit gespeichert.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Das hat nicht geklappt.");
    }
  };
  const running = Boolean(attendance && !attendance.data.pausedAt);
  const paused = Boolean(attendance?.data.pausedAt);
  return (
    <section
      className={`panel ${styles.card} ${styles.attendance} ${running ? styles.running : ""}`}
      data-whats-new="attendance"
      aria-live="polite"
    >
      <div className={styles.attendanceMain}>
        <span className={styles.attendanceIcon} aria-hidden="true">
          <DoorOpen size={22} />
        </span>
        <div className={styles.attendanceText}>
          <span>{running ? "Im Haus" : paused ? "Pause" : "Anwesenheit"}</span>
          {attendance ? (
            <strong>{clock(timerSeconds(attendance, now))} h</strong>
          ) : (
            <strong className={styles.idle}>Noch nicht im Haus</strong>
          )}
          {attendance && (
            <small>seit {berlinTime.format(new Date(String(attendance.data.startedAt)))}</small>
          )}
        </div>
        <div className={styles.attendanceActions}>
          {attendance && (
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label={paused ? "Fortsetzen" : "Pause"}
              onClick={() => void run(paused ? "resume" : "pause")}
            >
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}
          <button
            type="button"
            className={`button ${attendance ? "" : "primary"} ${styles.attendanceButton}`}
            disabled={busy}
            onClick={() => void run(attendance ? "stop" : "start")}
          >
            {attendance ? <Square size={16} /> : <Play size={16} />}
            {attendance ? "Gehen" : "Ankommen"}
          </button>
        </div>
      </div>
      {work && (
        <button type="button" className={styles.workLine} onClick={() => navigate("time")}>
          <span>
            {value(work.data, "title") || "Produktionszeit"}
            {value(work.data, "productionId") &&
              ` · ${value(workspace.records.productions.find((item) => item.id === work.data.productionId)?.data || {}, "title")}`}
          </span>
          <strong>{clock(timerSeconds(work, now))} h</strong>
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          <AlertTriangle size={15} /> {error}
        </p>
      )}
    </section>
  );
}
