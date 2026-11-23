"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { instantDate, localDate } from "@/shared/client-api";
import type { DomainRecord, Member } from "@/shared/contracts";
import { maskPlanBlockLabel, maskPlanClock, maskPlanStaffNames, type MaskPlanData } from "../model";
import styles from "./mask-plans.module.css";

export function RunOfShow({
  plan,
  members,
  actors,
  userId,
  performanceTime,
  eventDate,
  onChooseTime,
}: {
  plan: MaskPlanData;
  members: Member[];
  actors: DomainRecord[];
  userId: string;
  performanceTime: string;
  eventDate: string;
  onChooseTime: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ownLanes = plan.lanes.filter((lane) => lane.memberIds.includes(userId));
  const [selection, select] = useState(ownLanes.length ? "mine" : "all");
  const [day, setDay] = useState(() => eventDate || localDate());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const time = Date.now();
      setNow(time);
      timer = setTimeout(tick, 60000 - (time % 60000));
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [open]);
  const beginning =
    day && performanceTime ? instantDate(`${day}T${performanceTime}`).getTime() : NaN;
  const offset = Math.floor((now - beginning) / 60000);
  const blocks = plan.blocks.filter(
    (block) =>
      selection === "all" ||
      (selection === "mine"
        ? ownLanes.some((lane) => lane.id === block.laneId)
        : block.laneId === selection),
  );
  const current = blocks.filter(
    (block) => block.startMinutes <= offset && offset < block.startMinutes + block.durationMinutes,
  );
  const nextMinute = Math.min(
    ...blocks.filter((block) => block.startMinutes > offset).map((block) => block.startMinutes),
  );
  const next = blocks.filter((block) => block.startMinutes === nextMinute);
  const rows = (entries: typeof blocks, active: boolean) =>
    entries.map((block) => (
      <li key={block.id}>
        <strong>{maskPlanBlockLabel(block, actors)}</strong>
        <span>
          {active ? "bis " : "ab "}
          {maskPlanClock(
            block.startMinutes + (active ? block.durationMinutes : 0),
            performanceTime,
          )}
        </span>
      </li>
    ));
  return (
    <details className={styles.runOfShow} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <Clock3 size={16} aria-hidden="true" /> Wer ist als Nächstes dran?
      </summary>
      {open && (
        <>
          <div className={styles.runControls}>
            <label>
              Maskenplatz
              <select value={selection} onChange={(event) => select(event.target.value)}>
                {ownLanes.length > 0 && <option value="mine">Meine Einsätze</option>}
                <option value="all">Alle Plätze</option>
                {plan.lanes.map((lane, i) => (
                  <option key={lane.id} value={lane.id}>
                    {[lane.label, maskPlanStaffNames(lane, members).join(" / ")]
                      .filter(Boolean)
                      .join(" · ") || `Platz ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vorstellungstag
              <input
                type="date"
                value={day}
                readOnly={!!eventDate}
                onChange={(event) => setDay(event.target.value)}
              />
            </label>
          </div>
          <div role="status" aria-live="polite">
            {!Number.isFinite(beginning) ? (
              <p>
                {!performanceTime ? (
                  <button className="text-button" onClick={onChooseTime}>
                    Vorstellungsbeginn eintragen
                  </button>
                ) : (
                  "Wähle den Vorstellungstag."
                )}
              </p>
            ) : !blocks.length ? (
              <p>Für diesen Platz sind keine Einsätze eingetragen.</p>
            ) : offset >= 0 ? (
              <p>Die Vorstellung hat begonnen. Alle geplanten Maskenzeiten sind vorbei.</p>
            ) : (
              <>
                <h4>Jetzt</h4>
                {current.length ? (
                  <ul>{rows(current, true)}</ul>
                ) : (
                  <p>Gerade ist kein Einsatz geplant.</p>
                )}
                <h4>Als Nächstes</h4>
                {next.length ? (
                  <ul>{rows(next, false)}</ul>
                ) : (
                  <p>Kein weiterer Einsatz vor Beginn.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </details>
  );
}
