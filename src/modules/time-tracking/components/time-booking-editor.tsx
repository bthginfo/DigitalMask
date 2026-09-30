"use client";
import { useState } from "react";
import { categoriesFor } from "@/shared/domain-categories";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { hours, instantDate, localDate, localDateTime, num, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";

export function TimeBookingEditor({
  kind = "time",
  record,
  defaults = {},
  lockedProductionId,
  onClose,
  onSaved,
  onDraft,
}: {
  kind?: "time" | "attendance";
  record?: DomainRecord;
  defaults?: RecordData;
  lockedProductionId?: string;
  onClose: () => void;
  onSaved?: (record: DomainRecord) => void;
  onDraft?: (data: RecordData) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const attendance = kind === "attendance";
  const initial = { ...defaults, ...record?.data };
  const date = value(initial, "date") || localDate();
  const [title, setTitle] = useState(value(initial, "title") || (attendance ? "Anwesenheit" : ""));
  const [notes, setNotes] = useState(value(initial, "notes"));
  const [mode, setMode] = useState(
    attendance || (initial.start && initial.end) ? "interval" : "duration",
  );
  const [day, setDay] = useState(date);
  const [start, setStart] = useState(
    initial.start ? localDateTime(String(initial.start)) : `${date}T09:00`,
  );
  const [end, setEnd] = useState(
    initial.end ? localDateTime(String(initial.end)) : `${date}T17:00`,
  );
  const [minutes, setMinutes] = useState(
    Math.round((num(initial, "durationSeconds") || 1800) / 60),
  );
  const [pause, setPause] = useState(Math.round(num(initial, "pauseSeconds") / 60));
  const [production, setProduction] = useState(
    lockedProductionId ?? value(initial, "productionId"),
  );
  const categoryOptions = categoriesFor("time", workspace.records.categories);
  const [category, setCategory] = useState(
    value(initial, "category") || categoryOptions[0]?.key || "",
  );
  const [taskId, setTaskId] = useState(value(initial, "taskId"));
  const [error, setError] = useState("");
  const elapsed =
    mode === "interval" && start && end
      ? Math.floor((instantDate(end).getTime() - instantDate(start).getTime()) / 1000) - pause * 60
      : minutes * 60;
  const tasks = workspace.records.tasks.filter(
    (task) => value(task.data, "productionId") === production,
  );
  return (
    <Modal
      title={`${attendance ? "Anwesenheit" : "Zeitbuchung"} ${record ? "bearbeiten" : onDraft ? "offline vormerken" : "anlegen"}`}
      onClose={onClose}
      wide
    >
      <form
        className="booking-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 7 * 86400)
              throw new Error(
                "Prüfe Beginn, Ende und Pause. Eine Buchung muss zwischen einer Sekunde und sieben Tagen liegen.",
              );
            if (!attendance && !categoryOptions.some((option) => option.key === category))
              throw new Error("Bitte einen vorhandenen Tätigkeitsbereich auswählen.");
            const data: RecordData = {
              title: title.trim() || "Anwesenheit",
              date: mode === "interval" ? localDate(instantDate(start)) : day,
              durationSeconds: elapsed,
              pauseSeconds: pause * 60,
              start: mode === "interval" ? instantDate(start).toISOString() : "",
              end: mode === "interval" ? instantDate(end).toISOString() : "",
              ...(attendance
                ? { notes: notes.trim() }
                : { productionId: production, taskId, category }),
            };
            if (onDraft) onDraft(data);
            else {
              const saved = await save(kind, data, record);
              onSaved?.(saved);
            }
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <p className="muted booking-intro">
          {attendance
            ? "Wann warst du im Theater? Die Anwesenheit bleibt getrennt von der Arbeit an einzelnen Produktionen."
            : "Buche deine Tätigkeit mit Dauer oder einem genauen Zeitraum. Dein Anwesenheitstimer läuft unabhängig davon."}{" "}
          Zeiten werden in Europe/Berlin erfasst.
        </p>
        <label>
          {attendance ? "Bezeichnung (optional)" : "Tätigkeit"}
          <input
            required={!attendance}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {!attendance && (
          <div className="form-grid">
            <label>
              Produktion
              <select
                aria-label="Produktion"
                disabled={lockedProductionId !== undefined}
                value={production}
                onChange={(event) => {
                  setProduction(event.target.value);
                  setTaskId("");
                }}
              >
                <option value="">Allgemeine Arbeit</option>
                {workspace.records.productions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {value(row.data, "title")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tätigkeitsbereich
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {!categoryOptions.length && <option value="">Keine Kategorien vorhanden</option>}
                {categoryOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            {tasks.length > 0 && (
              <label>
                Aufgabe (optional)
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                  <option value="">Keine Aufgabe</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {value(task.data, "title")}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {!attendance && (
          <fieldset className="booking-mode">
            <legend>Wie möchtest du buchen?</legend>
            <div className="feedback-type-options">
              <label>
                <input
                  type="radio"
                  name="booking-mode"
                  checked={mode === "duration"}
                  onChange={() => setMode("duration")}
                />
                Dauer
              </label>
              <label>
                <input
                  type="radio"
                  name="booking-mode"
                  checked={mode === "interval"}
                  onChange={() => setMode("interval")}
                />
                Beginn & Ende
              </label>
            </div>
          </fieldset>
        )}
        <div className="form-grid">
          {mode === "interval" ? (
            <>
              <label>
                Beginn
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label>
                Ende
                <input
                  type="datetime-local"
                  required
                  min={start}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Datum
                <input
                  type="date"
                  required
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
              </label>
              <label>
                Dauer in Minuten
                <input
                  type="number"
                  required
                  min={1}
                  max={10080}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
              </label>
            </>
          )}
          <label>
            Pause in Minuten
            <input
              type="number"
              min={0}
              max={1440}
              value={pause}
              onChange={(event) => setPause(Number(event.target.value))}
            />
          </label>
        </div>
        {attendance && (
          <label>
            Notiz
            <textarea
              rows={3}
              maxLength={20000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        )}
        <div className="booking-calculation">
          <span>
            {mode === "interval" ? "Berechnete Zeit ohne Pause" : "Gebuchte Tätigkeitsdauer"}
          </span>
          <strong>{hours(Math.max(0, Number.isFinite(elapsed) ? elapsed : 0))} h</strong>
        </div>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {onDraft ? "Lokal speichern" : busy ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
