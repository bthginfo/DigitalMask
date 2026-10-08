"use client";
import { useRef, useState } from "react";
import { categoriesFor } from "@/shared/domain-categories";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  ApiFailure,
  hours,
  instantDate,
  localDate,
  localDateTime,
  num,
  value,
} from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { numberDraft, parseNumberDraft, previewNumberDraft } from "@/shared/number-draft";
import { clearTimeDraft, retainTimeDraft, timeDraftQueueKey } from "../client-drafts";
import styles from "./time-history.module.css";

export function TimeBookingEditor({
  kind = "time",
  record,
  defaults = {},
  lockedProductionId,
  onClose,
  onSaved,
  onDraft,
  proposal,
}: {
  kind?: "time" | "attendance";
  record?: DomainRecord;
  defaults?: RecordData;
  lockedProductionId?: string;
  onClose: () => void;
  onSaved?: (record: DomainRecord) => void;
  onDraft?: (data: RecordData) => void;
  proposal?: string;
}) {
  const { workspace, save, busy, notify } = useWorkspace();
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
  const [customEndDate, setCustomEndDate] = useState(
    Boolean(
      initial.start &&
      initial.end &&
      localDateTime(String(initial.start)).slice(0, 10) !==
        localDateTime(String(initial.end)).slice(0, 10),
    ),
  );
  const [minutes, setMinutes] = useState(
    numberDraft(Math.round((num(initial, "durationSeconds") || 1800) / 60)),
  );
  const [pause, setPause] = useState(numberDraft(Math.round(num(initial, "pauseSeconds") / 60)));
  const [production, setProduction] = useState(
    lockedProductionId ?? value(initial, "productionId"),
  );
  const categoryOptions = categoriesFor("time", workspace.records.categories);
  const [category, setCategory] = useState(
    value(initial, "category") || categoryOptions[0]?.key || "",
  );
  const [taskId, setTaskId] = useState(value(initial, "taskId"));
  const [error, setError] = useState("");
  const receipt = useRef("");
  const submitting = useRef(false);
  const queueKey = timeDraftQueueKey(kind, workspace.user.id);
  const pauseValue = previewNumberDraft(pause, { fallback: 0, min: 0, max: 1440, integer: true });
  const minutesValue = previewNumberDraft(minutes, { min: 1, max: 10080, integer: true });
  const elapsed =
    pauseValue === undefined
      ? undefined
      : mode === "interval" && start && end
        ? Math.floor((instantDate(end).getTime() - instantDate(start).getTime()) / 1000) -
          pauseValue * 60
        : minutesValue === undefined
          ? undefined
          : minutesValue * 60;
  const tasks = workspace.records.tasks.filter(
    (task) => value(task.data, "productionId") === production,
  );
  return (
    <Modal
      title={
        proposal
          ? "Geplante Zeit prüfen"
          : `${attendance ? "Anwesenheit" : "Zeitbuchung"} ${record ? "bearbeiten" : onDraft ? "offline vormerken" : "anlegen"}`
      }
      onClose={onClose}
      wide
    >
      <form
        className="booking-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current || busy) return;
          submitting.current = true;
          setError("");
          let retained = false;
          let saved = false;
          try {
            const parsedPause = parseNumberDraft(pause, {
              label: "Pause in Minuten",
              fallback: 0,
              min: 0,
              max: 1440,
              integer: true,
            })!;
            const parsedMinutes =
              mode === "duration"
                ? parseNumberDraft(minutes, {
                    label: "Dauer in Minuten",
                    required: true,
                    min: 1,
                    max: 10080,
                    integer: true,
                  })!
                : undefined;
            const durationSeconds =
              mode === "interval"
                ? Math.floor((instantDate(end).getTime() - instantDate(start).getTime()) / 1000) -
                  parsedPause * 60
                : parsedMinutes! * 60;
            if (
              !Number.isFinite(durationSeconds) ||
              durationSeconds <= 0 ||
              durationSeconds > 7 * 86400
            )
              throw new Error(
                "Prüfe Beginn, Ende und Pause. Eine Buchung muss zwischen einer Sekunde und sieben Tagen liegen.",
              );
            if (!attendance && !categoryOptions.some((option) => option.key === category))
              throw new Error("Bitte einen vorhandenen Tätigkeitsbereich auswählen.");
            const data: RecordData = {
              title: title.trim() || "Anwesenheit",
              date: mode === "interval" ? localDate(instantDate(start)) : day,
              durationSeconds,
              pauseSeconds: parsedPause * 60,
              start: mode === "interval" ? instantDate(start).toISOString() : "",
              end: mode === "interval" ? instantDate(end).toISOString() : "",
              ...(attendance
                ? { notes: notes.trim() }
                : { productionId: production, taskId, category }),
            };
            if (onDraft) onDraft(data);
            else {
              if (!record) {
                receipt.current ||= `manual:${crypto.randomUUID()}`;
                data.idempotencyKey = receipt.current;
                retained = retainTimeDraft(queueKey, receipt.current, data);
              }
              const booking = await save(kind, data, record);
              saved = true;
              if (!record) clearTimeDraft(queueKey, receipt.current);
              onSaved?.(booking);
            }
            onClose();
          } catch (exception) {
            if (saved) {
              notify(
                "Deine Buchung wurde gespeichert. Lade die Zeiten neu, falls die Anzeige noch nicht aktuell ist.",
              );
              onClose();
              return;
            }
            const uncertain =
              !saved &&
              exception instanceof ApiFailure &&
              (exception.status === 0 || exception.status >= 500);
            if (!uncertain && retained) clearTimeDraft(queueKey, receipt.current);
            const message =
              exception instanceof Error ? exception.message : "Speichern fehlgeschlagen";
            setError(
              uncertain
                ? `${message} ${retained ? "Deine Buchung ist in diesem Browser gesichert. Du kannst erneut speichern oder später die lokalen Entwürfe synchronisieren." : "Deine Eingaben bleiben hier stehen. Lass dieses Fenster geöffnet, bis das Speichern klappt."}`
                : message,
            );
          } finally {
            submitting.current = false;
          }
        }}
      >
        {proposal && (
          <div className={styles.proposalIntro}>
            <strong>Noch nicht gebucht · {attendance ? "Anwesenheit" : "Arbeitszeit"}</strong>
            <span>Kalenderplanung: {proposal}</span>
            <p>
              Prüfe Beginn, Ende, tatsächlich geleistete Zeit und Pausen
              {attendance ? "." : " sowie Tätigkeit und Produktion."} Erst dein ausdrückliches
              Buchen speichert Stunden.
            </p>
          </div>
        )}
        <p className="muted booking-intro">
          {attendance
            ? "Wann warst du im Theater? Die Anwesenheit bleibt getrennt von der Arbeit an einzelnen Produktionen."
            : "Buche deine Tätigkeit mit Dauer oder einem genauen Zeitraum. Dein Anwesenheitstimer läuft unabhängig davon."}{" "}
          Zeiten werden in Europe/Berlin erfasst.
        </p>
        {record && (
          <p className="small muted">
            Du bearbeitest die Buchung von{" "}
            {workspace.members.find((member) => member.id === record.data.userId)?.name ||
              workspace.user.name}
            . Die Änderung wird direkt gespeichert.
          </p>
        )}
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
                  onChange={(event) => {
                    const next = event.target.value;
                    setStart(next);
                    if (next && !customEndDate)
                      setEnd(`${next.slice(0, 10)}T${end.slice(11) || "17:00"}`);
                  }}
                />
              </label>
              <label>
                Ende
                <input
                  type="datetime-local"
                  required
                  min={start}
                  value={end}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setCustomEndDate(event.target.value.slice(0, 10) !== start.slice(0, 10));
                  }}
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
                  onChange={(event) => {
                    const next = event.target.value;
                    setDay(next);
                    if (next) {
                      setStart(`${next}T${start.slice(11) || "09:00"}`);
                      if (!customEndDate) setEnd(`${next}T${end.slice(11) || "17:00"}`);
                    }
                  }}
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
                  onChange={(event) => setMinutes(event.target.value)}
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
              onChange={(event) => setPause(event.target.value)}
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
          <strong>
            {elapsed === undefined || !Number.isFinite(elapsed)
              ? "–"
              : `${hours(Math.max(0, elapsed))} h`}
          </strong>
        </div>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {onDraft
              ? "Lokal speichern"
              : busy
                ? "Wird gespeichert …"
                : proposal
                  ? "Geprüfte Zeit buchen"
                  : "Speichern"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
