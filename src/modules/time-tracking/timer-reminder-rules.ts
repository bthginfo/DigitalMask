import type { RecordData } from "@/shared/contracts";

export type OpenTimerKind = "time" | "attendance";

/** A timer open this long was probably forgotten. */
export const LONG_RUNNING_SECONDS = 11 * 3600;
/** At most one reminder per timer in this interval. */
export const REMINDER_INTERVAL_SECONDS = 12 * 3600;

export interface OpenTimer {
  id: string;
  kind: OpenTimerKind;
  userId: string;
  departmentId: string;
  data: RecordData;
}

/** Wall-clock time since the start, including pauses: "läuft seit". */
export function timerOpenSeconds(data: RecordData, now: number) {
  const started = Date.parse(String(data.startedAt || ""));
  return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
}

export function timerLongRunning(data: RecordData, now: number) {
  return !data.stopping && timerOpenSeconds(data, now) > LONG_RUNNING_SECONDS;
}

export function timerReminderDue(data: RecordData, now: number) {
  if (!timerLongRunning(data, now)) return false;
  const reminded = Date.parse(String(data.remindedAt || ""));
  return !Number.isFinite(reminded) || now - reminded >= REMINDER_INTERVAL_SECONDS * 1000;
}

/** One reminder per person, covering all of their forgotten timers. */
export function selectTimerReminders(rows: OpenTimer[], now: number, exceptUserId?: string) {
  const people = new Map<string, { userId: string; departmentId: string; timers: OpenTimer[] }>();
  for (const row of rows) {
    if (row.userId === exceptUserId || !timerReminderDue(row.data, now)) continue;
    const key = `${row.departmentId}:${row.userId}`;
    const person = people.get(key) || {
      userId: row.userId,
      departmentId: row.departmentId,
      timers: [],
    };
    person.timers.push(row);
    people.set(key, person);
  }
  return [...people.values()];
}

export function timerReminderText(kinds: readonly OpenTimerKind[]) {
  const attendance = kinds.includes("attendance");
  const subject =
    attendance && kinds.includes("time")
      ? "Anwesenheit und Produktionszeit laufen"
      : attendance
        ? "Deine Anwesenheit läuft"
        : "Deine Produktionszeit läuft";
  return {
    title: "DigitalMask · Timer läuft noch",
    body: `${subject} seit über 11 Stunden. Vergessen zu stoppen?`,
  };
}
