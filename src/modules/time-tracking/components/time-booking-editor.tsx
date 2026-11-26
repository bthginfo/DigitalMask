"use client";
import { useRef, useState } from "react";
import { categoriesFor } from "@/shared/domain-categories";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { ApiFailure, instantDate, localDate, localDateTime, num, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import {
  formatDuration,
  parseDurationInput,
  previewDurationInput,
  type DurationInputOptions,
} from "@/shared/duration-input";
import { clearTimeDraft, retainTimeDraft, timeDraftQueueKey } from "../client-drafts";
import { TimeBookingDelete } from "./time-booking-delete";
import { DurationField } from "./duration-field";
import { initialBookingTimes } from "../booking-defaults";
import styles from "./time-history.module.css";
import editorStyles from "./booking-editor.module.css";

const DURATION: DurationInputOptions = { label: "Dauer", required: true, min: 60, max: 7 * 86400 };
const PAUSE: DurationInputOptions = { label: "Pause", bareUnit: "minutes", min: 0, max: 86400 };

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
  const times = initialBookingTimes(initial);
  const date = times.date;
  const [title, setTitle] = useState(value(initial, "title") || (attendance ? "Anwesenheit" : ""));
  const [notes, setNotes] = useState(value(initial, "notes"));
  const [mode, setMode] = useState(
    attendance || (initial.start && initial.end) ? "interval" : "duration",
  );
  const [day, setDay] = useState(date);
  const [start, setStart] = useState(times.start);
  const [end, setEnd] = useState(times.end);
  const [customEndDate, setCustomEndDate] = useState(
    Boolean(
      initial.start &&
      initial.end &&
      localDateTime(String(initial.start)).slice(0, 10) !==
        localDateTime(String(initial.end)).slice(0, 10),
    ),
  );
  const initialDuration = num(initial, "durationSeconds");
  const [duration, setDuration] = useState(initialDuration ? formatDuration(initialDuration) : "");
  const [pause, setPause] = useState(
    num(initial, "pauseSeconds") ? formatDuration(num(initial, "pauseSeconds")) : "",
  );
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
  // An unchanged duration keeps its exact seconds, e.g. from a stopped timer.
  const durationSeconds = (text: string, parse: typeof parseDurationInput) =>
    initialDuration && text === formatDuration(initialDuration)
      ? initialDuration
      : parse(text, DURATION);
  const pauseValue = previewDurationInput(pause, PAUSE);
  const durationValue = previewDurationInput(duration, DURATION);
  const elapsed =
    pauseValue === undefined
      ? undefined
      : mode === "interval" && start && end
        ? Math.floor((instantDate(end).getTime() - instantDate(start).getTime()) / 1000) -
          pauseValue
        : durationValue === undefined
          ? undefined
          : durationSeconds(duration, () => durationValue);
  const selectedProduction = workspace.records.productions.find((row) => row.id === production);
  const defaultTitle = attendance
    ? "Anwesenheit"
    : selectedProduction
      ? value(selectedProduction.data, "title")
      : categoryOptions.find((option) => option.key === category)?.name || "Arbeitszeit";
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
        className={`booking-form ${editorStyles.form}`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current || busy) return;
          submitting.current = true;
          setError("");
          let retained = false;
          let saved = false;
          try {
            const parsedPause = parseDurationInput(pause, PAUSE);
            const bookedSeconds =
              mode === "interval"
                ? Math.floor((instantDate(end).getTime() - instantDate(start).getTime()) / 1000) -
                  parsedPause
                : durationSeconds(duration, parseDurationInput);
            if (!Number.isFinite(bookedSeconds) || bookedSeconds <= 0 || bookedSeconds > 7 * 86400)
              throw new Error(
                "Prüfe Beginn, Ende und Pause. Eine Buchung muss zwischen einer Sekunde und sieben Tagen liegen.",
              );
            if (!attendance && !categoryOptions.some((option) => option.key === category))
              throw new Error("Bitte einen vorhandenen Tätigkeitsbereich auswählen.");
            const data: RecordData = {
              title: title.trim() || defaultTitle,
              date: mode === "interval" ? localDate(instantDate(start)) : day,
              durationSeconds: bookedSeconds,
              pauseSeconds: parsedPause,
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
            : "Buche deine Tätigkeit mit Dauer oder Beginn und Ende. Deine Anwesenheit trägst du separat ein."}
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
          {attendance ? "Bezeichnung (optional)" : "Tätigkeit (optional)"}
          <input
            maxLength={200}
            placeholder={defaultTitle}
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
          <fieldset className={`booking-mode ${editorStyles.mode}`}>
            <legend>Wie möchtest du buchen?</legend>
            <div className={editorStyles.segments}>
              <label>
                <input
                  type="radio"
                  name="booking-mode"
                  checked={mode === "duration"}
                  onChange={() => setMode("duration")}
                />
                Nur Dauer
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
              <DurationField
                label="Dauer"
                value={duration}
                onChange={setDuration}
                options={DURATION}
              />
            </>
          )}
          <DurationField
            label="Pause"
            value={pause}
            onChange={setPause}
            placeholder="0:00"
            hint="z. B. 0:30 oder 30 (Minuten)"
            options={PAUSE}
          />
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
        <div className={`booking-calculation ${editorStyles.calculation}`}>
          <span>
            {mode === "interval" ? "Berechnete Zeit ohne Pause" : "Gebuchte Tätigkeitsdauer"}
          </span>
          <strong>
            {elapsed === undefined || !Number.isFinite(elapsed)
              ? "–"
              : `${formatDuration(Math.max(0, elapsed))} h`}
          </strong>
        </div>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          {record && <TimeBookingDelete record={record} onDeleted={onClose} />}
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
