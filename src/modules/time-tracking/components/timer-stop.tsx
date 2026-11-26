"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { instantDate, localDateTime, value } from "@/shared/client-api";
import { useStoredValue } from "@/shared/client-storage";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { timerLongRunning, timerOpenSeconds } from "../timer-reminder-rules";
import styles from "./timer-stop.module.css";

type Action = ReturnType<typeof useWorkspace>["action"];
type Timer = { id: string; data: RecordData } | null | undefined;

const clock = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const timerStartLabel = (timer: { data: RecordData }) =>
  clock.format(new Date(String(timer.data.startedAt)));

/** Ends production before attendance; a failed production stop leaves attendance running. */
export async function stopTimers(
  action: Action,
  { attendance, production, end }: { attendance: boolean; production: boolean; end?: string },
) {
  let booked: unknown;
  const data = end ? { end } : {};
  if (production) booked = await action("timer-stop", undefined, data);
  if (attendance) booked = await action("attendance-timer-stop", undefined, data);
  return booked && typeof booked === "object" && "kind" in booked
    ? (booked as DomainRecord)
    : undefined;
}

/** Leaving the theatre usually ends the production work too; the person decides. */
export function needsProductionPrompt(production: Timer) {
  return Boolean(production && !production.data.stopping);
}

export function AttendanceStopPrompt({
  end,
  onClose,
  onStopped,
}: {
  end?: string;
  onClose: () => void;
  onStopped: (booked?: DomainRecord) => void;
}) {
  const { workspace, action, busy, notify } = useWorkspace();
  const [error, setError] = useState("");
  const production = workspace.timer;
  const finish = async (withProduction: boolean) => {
    setError("");
    try {
      const booked = await stopTimers(action, {
        attendance: true,
        production: withProduction && Boolean(production),
        end,
      });
      notify(
        withProduction
          ? "Anwesenheit und Produktionszeit gespeichert."
          : "Anwesenheit gespeichert.",
      );
      onStopped(booked);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Stoppen fehlgeschlagen.");
    }
  };
  return (
    <Modal title="Produktionszeit auch beenden?" onClose={onClose}>
      <p className={styles.promptText}>
        {production
          ? `„${value(production.data, "title") || "Produktionszeit"}“ läuft seit ${timerStartLabel(production)}.`
          : "Deine Produktionszeit läuft noch."}
      </p>
      <ErrorMessage message={error} />
      <footer className={`dialog-footer ${styles.promptActions}`}>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button disabled={busy} onClick={() => void finish(false)}>
          Nur Anwesenheit
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void finish(true)}>
          Beide beenden
        </Button>
      </footer>
    </Modal>
  );
}

/** Stop a forgotten timer at the time the person actually left. */
export function TimerEndDialog({
  kind,
  onClose,
  onStopped,
}: {
  kind: "attendance" | "time";
  onClose: () => void;
  onStopped: (booked?: DomainRecord) => void;
}) {
  const { workspace, action, busy, notify } = useWorkspace();
  const timer = kind === "attendance" ? workspace.attendanceTimer : workspace.timer;
  const production = kind === "attendance" ? workspace.timer : null;
  const [end, setEnd] = useState(() => localDateTime(new Date().toISOString()));
  const [withProduction, setWithProduction] = useState(true);
  const [error, setError] = useState("");
  if (!timer) return null;
  const started = localDateTime(String(timer.data.startedAt));
  return (
    <Modal title="Endzeit korrigieren" onClose={onClose}>
      <form
        className={styles.endForm}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            if (!end || end <= started) throw new Error("Die Endzeit muss nach dem Start liegen.");
            const iso = instantDate(end).toISOString();
            const booked = await stopTimers(action, {
              attendance: kind === "attendance",
              production: kind === "time" || (Boolean(production) && withProduction),
              end: iso,
            });
            notify(`Gespeichert bis ${localDateTime(iso).slice(11)} Uhr.`);
            onStopped(booked);
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen.");
          }
        }}
      >
        <p className={styles.promptText}>
          {kind === "attendance" ? "Anwesenheit" : "Produktionszeit"} seit {timerStartLabel(timer)}.
          Wann hast du aufgehört?
        </p>
        <label>
          Ende
          <input
            type="datetime-local"
            required
            min={started}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        {production && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={withProduction}
              onChange={(event) => setWithProduction(event.target.checked)}
            />
            Produktionszeit mit derselben Endzeit beenden
          </label>
        )}
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Speichern
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

export function useTimerClock(active: boolean, interval = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

/** The first open timer that has been running for more than 11 hours. */
export function longRunningTimer(
  attendance: Timer,
  production: Timer,
  now: number,
): { kind: "attendance" | "time"; timer: { id: string; data: RecordData } } | undefined {
  if (attendance && timerLongRunning(attendance.data, now))
    return { kind: "attendance", timer: attendance };
  if (production && timerLongRunning(production.data, now))
    return { kind: "time", timer: production };
  return undefined;
}

/** Gentle reminder with quick fixes; "Läuft noch" hides it for three hours on this device. */
export function LongTimerWarning({
  onBooked,
  compact = false,
}: {
  onBooked?: (record: DomainRecord) => void;
  compact?: boolean;
}) {
  const { workspace, action, busy, notify } = useWorkspace();
  const attendance = workspace.attendanceTimer;
  const production = workspace.timer;
  const now = useTimerClock(Boolean(attendance || production));
  const [dialog, setDialog] = useState<"" | "prompt" | "end">("");
  const [error, setError] = useState("");
  const [hiddenJson, setHiddenJson] = useStoredValue(
    `digitalmask-long-timer:${workspace.user.id}`,
    "{}",
  );
  const open = longRunningTimer(attendance, production, now);
  let hidden: { id?: string; until?: number } = {};
  try {
    hidden = JSON.parse(hiddenJson);
  } catch {
    hidden = {};
  }
  if (workspace.user.role === "superadmin" || !open) return null;
  const dismissed = hidden.id === open.timer.id && Number(hidden.until) > now;
  const done = (booked?: DomainRecord) => {
    setDialog("");
    if (booked) onBooked?.(booked);
  };
  const stopNow = async () => {
    setError("");
    if (open.kind === "attendance" && needsProductionPrompt(production)) {
      setDialog("prompt");
      return;
    }
    try {
      done(
        await stopTimers(action, {
          attendance: open.kind === "attendance",
          production: open.kind === "time",
        }),
      );
      notify(
        open.kind === "attendance" ? "Anwesenheit gespeichert." : "Produktionszeit gespeichert.",
      );
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Stoppen fehlgeschlagen.");
    }
  };
  return (
    <>
      {!dismissed && (
        <section
          className={`${styles.warning} ${compact ? styles.compact : ""}`}
          role="status"
          aria-label="Timer läuft lange"
        >
          <AlertTriangle size={18} className={styles.icon} aria-hidden="true" />
          <div className={styles.text}>
            <strong>
              Läuft seit {Math.floor(timerOpenSeconds(open.timer.data, now) / 3600)} h – vergessen
              zu stoppen?
            </strong>
            <span>
              {open.kind === "attendance" ? "Anwesenheit" : "Produktionszeit"} seit{" "}
              {timerStartLabel(open.timer)}
            </span>
          </div>
          <div className={styles.actions}>
            <Button variant="primary" disabled={busy} onClick={() => void stopNow()}>
              Jetzt stoppen
            </Button>
            <Button disabled={busy} onClick={() => setDialog("end")}>
              Endzeit korrigieren
            </Button>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => {
                try {
                  setHiddenJson(JSON.stringify({ id: open.timer.id, until: now + 3 * 3600_000 }));
                } catch {
                  // Without device storage the reminder simply stays visible.
                }
              }}
            >
              Läuft noch
            </button>
          </div>
          <ErrorMessage message={error} />
        </section>
      )}
      {dialog === "prompt" && (
        <AttendanceStopPrompt onClose={() => setDialog("")} onStopped={done} />
      )}
      {dialog === "end" && (
        <TimerEndDialog kind={open.kind} onClose={() => setDialog("")} onStopped={done} />
      )}
    </>
  );
}
