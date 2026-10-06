"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Clock3, DoorOpen, Pause, Play, Square } from "lucide-react";
import { categoriesFor } from "@/shared/domain-categories";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, num, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage } from "@/components/ui";
import styles from "./work-timer.module.css";

export function TimerPanel({
  compact = false,
  productionId = "",
  kind = "time",
  onBooked,
}: {
  compact?: boolean;
  productionId?: string;
  kind?: "time" | "attendance";
  onBooked?: (record: DomainRecord) => void;
}) {
  const { workspace, action, busy } = useWorkspace();
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(productionId);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const fieldsId = useId();
  const titleInput = useRef<HTMLInputElement>(null);
  const categoryOptions = categoriesFor("time", workspace.records.categories);
  const [category, setCategory] = useState(categoryOptions[0]?.key || "");
  const selectedCategory = categoryOptions.some((option) => option.key === category)
    ? category
    : categoryOptions[0]?.key || "";
  const attendance = kind === "attendance";
  const timer = attendance ? workspace.attendanceTimer : workspace.timer;
  useEffect(() => {
    if (!timer || timer.data.pausedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer]);
  if (workspace.user.role === "superadmin") return null;
  const seconds = timer
    ? Math.max(
        0,
        Math.floor(
          ((timer.data.pausedAt ? new Date(String(timer.data.pausedAt)).getTime() : now) -
            new Date(String(timer.data.startedAt)).getTime()) /
            1000,
        ) - num(timer.data, "pauseSeconds"),
      )
    : 0;
  const display = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const run = async (operation: string) => {
    setError("");
    if (operation === "start" && !attendance && !title.trim()) {
      setFieldsOpen(true);
      requestAnimationFrame(() => titleInput.current?.focus());
      return;
    }
    try {
      const result = await action(
        `${attendance ? "attendance-" : ""}timer-${operation}`,
        undefined,
        operation === "start"
          ? attendance
            ? { title: title.trim() || "Anwesenheit" }
            : { title: title.trim(), productionId: project, category: selectedCategory }
          : {},
      );
      setNow(Date.now());
      if (operation === "start") setFieldsOpen(false);
      if (operation === "stop" && result && typeof result === "object" && "kind" in result)
        onBooked?.(result as DomainRecord);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Timer-Aktion fehlgeschlagen");
    }
  };
  const Icon = attendance ? DoorOpen : Clock3;
  const timerProject = timer
    ? workspace.records.productions.find((row) => row.id === timer.data.productionId)
    : undefined;
  return (
    <section
      className={`timer-panel ${styles.timer} ${compact ? "compact" : ""} ${attendance ? "attendance-timer" : ""}`}
      aria-label={attendance ? "Anwesenheitstimer" : "Arbeitstimer"}
    >
      <header className={styles.header}>
        <button
          className={styles.mobileToggle}
          aria-label={
            timer
              ? `${attendance ? "Anwesenheit" : "Arbeit"}: Details und weitere Aktionen`
              : attendance
                ? "Bezeichnung ändern"
                : "Tätigkeit & Zuordnung"
          }
          aria-expanded={fieldsOpen}
          aria-controls={fieldsId}
          onClick={() => setFieldsOpen((open) => !open)}
        >
          <Icon size={16} />
          <span>
            {attendance ? "Anwesenheit" : "Arbeit"}
            <small>
              {timer ? "Details" : attendance ? "Bezeichnung" : "Tätigkeit & Zuordnung"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className={styles.label}>
          <Icon size={16} />
          {attendance ? "Anwesenheit" : "Arbeit"}
        </span>
        <Badge tone={timer && !timer.data.pausedAt ? "green" : "neutral"}>
          {timer ? (timer.data.pausedAt ? "Pausiert" : "Timer läuft") : "Bereit"}
        </Badge>
      </header>
      {timer && <p className={styles.runningTitle}>{value(timer.data, "title")}</p>}
      <div className={styles.main}>
        <p className={styles.value} aria-live="off">
          {display}
        </p>
        <div className={styles.primaryActions}>
          {timer ? (
            <>
              <Button
                disabled={busy}
                onClick={() => void run(timer.data.pausedAt ? "resume" : "pause")}
              >
                {timer.data.pausedAt ? <Play size={15} /> : <Pause size={15} />}
                {timer.data.pausedAt ? "Weiter" : "Pause"}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void run("stop")}
                title="Timer stoppen und Zeit buchen"
              >
                <Square size={13} />
                <span className={styles.desktopLabel}>Stoppen & buchen</span>
                <span className={styles.mobileLabel}>Stoppen</span>
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={busy || (!attendance && !selectedCategory)}
              onClick={() => void run("start")}
            >
              <Play size={15} />
              <span className={styles.desktopLabel}>
                {attendance ? "Anwesenheit starten" : "Arbeitstimer starten"}
              </span>
              <span className={styles.mobileLabel}>Starten</span>
            </Button>
          )}
        </div>
      </div>
      <div id={fieldsId} className={`${styles.details} ${fieldsOpen ? styles.detailsOpen : ""}`}>
        {timer ? (
          <>
            <p className="small muted">
              {attendance
                ? "Deine Anwesenheit läuft unabhängig von einzelnen Tätigkeiten."
                : timerProject
                  ? value(timerProject.data, "title")
                  : "Allgemeine Arbeit"}
              {` · Beginn ${dateLabel(String(timer.data.startedAt), true)}`}
            </p>
            <Button
              variant="danger-ghost"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(`${attendance ? "Anwesenheits" : "Arbeits"}timer ohne Buchung verwerfen?`)
                )
                  void run("discard");
              }}
            >
              Timer verwerfen
            </Button>
          </>
        ) : (
          <>
            <label>
              {attendance ? "Bezeichnung (optional)" : "Tätigkeit"}
              <input
                ref={titleInput}
                maxLength={200}
                placeholder={attendance ? "Anwesenheit" : "Woran arbeitest du?"}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            {!attendance && (
              <div className={styles.selects}>
                <label>
                  Produktion
                  <select
                    value={project}
                    disabled={!!productionId}
                    onChange={(event) => setProject(event.target.value)}
                  >
                    <option value="">Allgemeine Arbeit</option>
                    {workspace.records.productions
                      .filter((row) => row.data.status !== "archived")
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {value(row.data, "title")}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Tätigkeitsbereich
                  <select
                    value={selectedCategory}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    {!categoryOptions.length && (
                      <option value="">Keine Kategorien vorhanden</option>
                    )}
                    {categoryOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="small muted">
              {attendance
                ? "Im Theater beginnen. Der Arbeitstimer kann gleichzeitig laufen."
                : "Allgemeine Tätigkeiten kannst du auch ohne Produktion buchen."}
            </p>
          </>
        )}
      </div>
      <ErrorMessage message={error} />
    </section>
  );
}
