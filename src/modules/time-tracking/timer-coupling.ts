import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { attendanceTimers, records, timers } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { categoryName } from "@/shared/domain-categories";
import type { RecordData } from "@/shared/contracts";

export type TimerKind = "time" | "attendance";

/**
 * Production time always lies within attendance. Starting or resuming production starts or
 * resumes attendance; pausing attendance pauses production. Stopping never cascades on the server:
 * the client asks before it ends production together with attendance.
 */
export function coupledTimer(kind: TimerKind, action: string): TimerKind | undefined {
  if (kind === "time" && (action === "timer-start" || action === "timer-resume"))
    return "attendance";
  if (kind === "attendance" && action === "timer-pause") return "time";
  return undefined;
}

/** Coupled actions always lock attendance before production, so two requests cannot deadlock. */
export function timerLockOrder(kind: TimerKind, action: string): TimerKind[] {
  return coupledTimer(kind, action) ? ["attendance", "time"] : [kind];
}

export const timerLockKey = (kind: TimerKind, userId: string) => `${kind}:timer:${userId}`;

export function newTimerData(title: string, now: string, data: RecordData = {}): RecordData {
  return {
    title,
    productionId: String(data.productionId || ""),
    taskId: String(data.taskId || ""),
    category: String(data.category || "production"),
    startedAt: now,
    pausedAt: null,
    pauseSeconds: 0,
  };
}

export function pausedTimerData(data: RecordData, now: string): RecordData | undefined {
  if (data.stopping || data.pausedAt) return undefined;
  return { ...data, pausedAt: now };
}

export function resumedTimerData(data: RecordData, now: string): RecordData | undefined {
  if (data.stopping || !data.pausedAt) return undefined;
  const pause = Math.floor((Date.parse(now) - Date.parse(String(data.pausedAt))) / 1000);
  return {
    ...data,
    pausedAt: null,
    pauseSeconds: Number(data.pauseSeconds || 0) + Math.max(0, pause),
  };
}

/** Without a typed activity, the production (or the work area) names the booking. */
export function defaultTimerTitle(
  kind: TimerKind,
  title: string,
  productionTitle?: string,
  categoryLabel?: string,
) {
  return (
    title.trim() ||
    (kind === "attendance" ? "Anwesenheit" : productionTitle?.trim() || categoryLabel?.trim()) ||
    "Arbeitszeit"
  );
}

export async function timeCategoryLabel(context: Context, key: string, tx: Transaction) {
  const rows = await tx
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "categories"),
        sql`${records.data}->>'scope'='time'`,
        sql`${records.data}->>'key'=${key}`,
      ),
    );
  return categoryName("time", key, rows as Parameters<typeof categoryName>[2]);
}

/**
 * A corrected end for a forgotten timer. An ongoing pause still ends the booking at its start,
 * like a regular stop; a retried stop keeps the end it reserved first.
 */
export function timerStopEnd(data: RecordData, requested: unknown, now: string) {
  if (data.stoppedAt) return String(data.stoppedAt);
  const paused = data.pausedAt ? new Date(String(data.pausedAt)).toISOString() : "";
  if (requested === undefined || requested === null || requested === "") return paused || now;
  const end = new Date(String(requested));
  if (!Number.isFinite(end.getTime()))
    throw new HttpError(400, "Bitte gib eine gültige Endzeit an.");
  if (end.getTime() <= Date.parse(String(data.startedAt)))
    throw new HttpError(400, "Die Endzeit muss nach dem Start liegen.");
  if (end.getTime() > Date.parse(now) + 60_000)
    throw new HttpError(400, "Die Endzeit darf nicht in der Zukunft liegen.");
  const iso = end.getTime() > Date.parse(now) ? now : end.toISOString();
  return paused && iso > paused ? paused : iso;
}

type TimerRow = typeof timers.$inferSelect;

/** Applies the coupled change in the caller's transaction, after both timer locks are held. */
export async function applyTimerCoupling(
  tx: Transaction,
  context: Context,
  kind: TimerKind,
  action: string,
  now: string,
): Promise<{
  attendanceTimer?: TimerRow;
  attendanceStarted?: boolean;
  attendanceResumed?: boolean;
  timer?: TimerRow;
  productionPaused?: boolean;
}> {
  const other = coupledTimer(kind, action);
  if (!other) return {};
  const table = other === "attendance" ? attendanceTimers : timers;
  const [row] = await tx
    .select()
    .from(table)
    .where(eq(table.userId, context.user.id))
    .for("update");
  // A row from another department belongs to a different workspace; leave it untouched.
  if (row && row.departmentId !== context.departmentId) return {};
  if (other === "attendance") {
    if (!row) {
      const [created] = await tx
        .insert(attendanceTimers)
        .values({
          id: crypto.randomUUID(),
          userId: context.user.id,
          departmentId: context.departmentId,
          data: newTimerData("Anwesenheit", now),
        })
        .returning();
      return { attendanceTimer: created, attendanceStarted: true };
    }
    const resumed = resumedTimerData(row.data, now);
    if (!resumed) return { attendanceTimer: row };
    const [updated] = await tx
      .update(attendanceTimers)
      .set({ data: resumed })
      .where(eq(attendanceTimers.id, row.id))
      .returning();
    return { attendanceTimer: updated, attendanceResumed: true };
  }
  const paused = row && pausedTimerData(row.data, now);
  if (!row || !paused) return row ? { timer: row } : {};
  const [updated] = await tx
    .update(timers)
    .set({ data: paused })
    .where(eq(timers.id, row.id))
    .returning();
  return { timer: updated, productionPaused: true };
}
