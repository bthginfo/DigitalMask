"use client";
import { useEffect, useState } from "react";
import { Clock3, DoorOpen, Pause, Play, Square } from "lucide-react";
import { categoriesFor } from "@/shared/domain-categories";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, num, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage } from "@/components/ui";

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
      className={`timer-panel ${compact ? "compact" : ""} ${attendance ? "attendance-timer" : ""}`}
      aria-label={attendance ? "Anwesenheitstimer" : "Arbeitstimer"}
    >
      <header>
        <span className="eyebrow">
          <Icon size={15} />
          {attendance ? "ANWESENHEIT IM THEATER" : "PRODUKTIONS- / ARBEITSZEIT"}
        </span>
        {timer && (
          <Badge tone={timer.data.pausedAt ? "neutral" : "green"}>
            {timer.data.pausedAt ? "Pausiert" : "Timer läuft"}
          </Badge>
        )}
      </header>
      <p className="timer-value" aria-live="off">
        {display}
      </p>
      {timer ? (
        <>
          <p className="timer-caption">{value(timer.data, "title")}</p>
          <p className="small muted timer-context">
            {attendance
              ? "Deine Anwesenheit, unabhängig von einzelnen Tätigkeiten."
              : `${timerProject ? value(timerProject.data, "title") : "Allgemeine Arbeit"} · Beginn ${dateLabel(String(timer.data.startedAt), true)}`}
          </p>
          <div className="timer-controls">
            <Button
              disabled={busy}
              onClick={() => void run(timer.data.pausedAt ? "resume" : "pause")}
            >
              {timer.data.pausedAt ? <Play size={15} /> : <Pause size={15} />}
              {timer.data.pausedAt ? "Fortsetzen" : "Pause"}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void run("stop")}>
              <Square size={13} />
              Stoppen & buchen
            </Button>
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
          </div>
        </>
      ) : (
        <>
          <label>
            <span className="visually-hidden">
              {attendance ? "Bezeichnung für Anwesenheit" : "Tätigkeit"}
            </span>
            <input
              maxLength={200}
              placeholder={attendance ? "Anwesenheit (optional ändern)" : "Woran arbeitest du?"}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {!attendance && (
            <div className="timer-selects">
              <select
                value={project}
                disabled={!!productionId}
                aria-label="Produktion für Timer"
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
              <select
                value={selectedCategory}
                aria-label="Tätigkeitsbereich für Timer"
                onChange={(event) => setCategory(event.target.value)}
              >
                {!categoryOptions.length && <option value="">Keine Kategorien vorhanden</option>}
                {categoryOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {attendance && (
            <p className="small muted timer-context">
              Im Theater beginnen. Pausen getrennt erfassen. Der Arbeitstimer kann gleichzeitig
              laufen.
            </p>
          )}
          <Button
            variant="primary"
            disabled={busy || (!attendance && (!title.trim() || !selectedCategory))}
            onClick={() => void run("start")}
          >
            <Play size={15} />
            {attendance ? "Anwesenheit starten" : "Arbeitstimer starten"}
          </Button>
        </>
      )}
      <ErrorMessage message={error} />
    </section>
  );
}
