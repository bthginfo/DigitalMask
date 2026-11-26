import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { attendanceTimers, memberships, records, timers } from "@/platform/db/schema";
import { departmentDevices, pushConfigured, send } from "@/modules/notifications/service";
import { pushPayload } from "@/modules/notifications/payload";
import {
  LONG_RUNNING_SECONDS,
  REMINDER_INTERVAL_SECONDS,
  selectTimerReminders,
  timerReminderText,
  type OpenTimer,
  type OpenTimerKind,
} from "./timer-reminder-rules";

const OPPORTUNISTIC_INTERVAL_MS = 15 * 60_000;

const tables = { time: timers, attendance: attendanceTimers } as const;

async function openTimers(cutoff: string, departmentId?: string) {
  const read = async (kind: OpenTimerKind) => {
    const table = tables[kind];
    const rows = await db
      .select({
        id: table.id,
        userId: table.userId,
        departmentId: table.departmentId,
        data: table.data,
      })
      .from(table)
      .where(
        and(
          departmentId ? eq(table.departmentId, departmentId) : undefined,
          sql`${table.data}->>'startedAt' < ${cutoff}`,
        ),
      );
    return rows.map((row) => ({ ...row, kind }));
  };
  return [...(await read("attendance")), ...(await read("time"))];
}

/** Marks the reminder on the timer row itself; only one concurrent run can claim it. */
async function claim(rows: OpenTimer[], stamp: string, threshold: string) {
  const claimed: string[] = [];
  for (const kind of ["attendance", "time"] as const) {
    const ids = rows.filter((row) => row.kind === kind).map((row) => row.id);
    if (!ids.length) continue;
    const table = tables[kind];
    const updated = await db
      .update(table)
      .set({ data: sql`jsonb_set(${table.data}, '{remindedAt}', to_jsonb(${stamp}::text))` })
      .where(
        and(
          inArray(table.id, ids),
          sql`coalesce(${table.data}->>'stopping', 'false') <> 'true'`,
          sql`coalesce(${table.data}->>'remindedAt', '') < ${threshold}`,
        ),
      )
      .returning({ id: table.id });
    claimed.push(...updated.map((row) => row.id));
  }
  return claimed;
}

async function release(rows: OpenTimer[], stamp: string) {
  for (const kind of ["attendance", "time"] as const) {
    const ids = rows.filter((row) => row.kind === kind).map((row) => row.id);
    if (!ids.length) continue;
    const table = tables[kind];
    await db
      .update(table)
      .set({ data: sql`${table.data} - 'remindedAt'` })
      .where(and(inArray(table.id, ids), sql`${table.data}->>'remindedAt' = ${stamp}`));
  }
}

/**
 * Sends one web push per person whose attendance or production timer has been open for more
 * than 11 hours and who was not reminded in the last 12 hours. Daily cron plus opportunistic runs.
 */
export async function remindLongRunningTimers({
  now = new Date(),
  departmentId,
  exceptUserId,
}: { now?: Date; departmentId?: string; exceptUserId?: string } = {}) {
  if (!pushConfigured()) return { reminded: 0, failed: 0 };
  const time = now.getTime();
  const cutoff = new Date(time - LONG_RUNNING_SECONDS * 1000).toISOString();
  const threshold = new Date(time - REMINDER_INTERVAL_SECONDS * 1000).toISOString();
  const due = selectTimerReminders(await openTimers(cutoff, departmentId), time, exceptUserId);
  if (!due.length) return { reminded: 0, failed: 0 };
  const active = await db
    .select({ userId: memberships.userId, departmentId: memberships.departmentId })
    .from(memberships)
    .where(
      and(
        inArray(memberships.userId, [...new Set(due.map((person) => person.userId))]),
        eq(memberships.status, "active"),
      ),
    );
  const unread = await db
    .select({
      userId: records.ownerId,
      departmentId: records.departmentId,
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    .where(
      and(
        eq(records.kind, "notifications"),
        inArray(records.ownerId, [...new Set(due.map((person) => person.userId))]),
        sql`coalesce(${records.data}->>'read','false') <> 'true'`,
      ),
    )
    .groupBy(records.departmentId, records.ownerId);
  const stamp = now.toISOString();
  let reminded = 0;
  let failed = 0;
  for (const person of due) {
    if (
      !active.some(
        (row) => row.userId === person.userId && row.departmentId === person.departmentId,
      )
    )
      continue;
    const devices = (await departmentDevices(person.departmentId)).filter(
      (device) => device.userId === person.userId,
    );
    if (!devices.length) continue;
    const claimed = await claim(person.timers, stamp, threshold);
    const timersClaimed = person.timers.filter((row) => claimed.includes(row.id));
    if (!timersClaimed.length) continue;
    const count =
      unread.find((row) => row.userId === person.userId && row.departmentId === person.departmentId)
        ?.count || 0;
    const payload = {
      ...pushPayload("TimerRunningV1", `timer-reminder:${person.userId}`, person.userId, count, {
        link: "/?module=time",
      }),
      ...timerReminderText(timersClaimed.map((row) => row.kind)),
    };
    const results = await Promise.allSettled(devices.map((device) => send(device, payload)));
    if (results.some((result) => result.status === "fulfilled" && result.value)) reminded++;
    else {
      failed++;
      // Nothing reached a device: let the next run try again instead of waiting 12 hours.
      await release(timersClaimed, stamp);
    }
  }
  return { reminded, failed };
}

const lastOpportunisticRun = new Map<string, number>();

/** Cheap check while someone uses the workspace, at most every 15 minutes per department. */
export function scheduleTimerReminders(departmentId: string, userId: string) {
  if (!pushConfigured()) return;
  const now = Date.now();
  if ((lastOpportunisticRun.get(departmentId) || 0) > now - OPPORTUNISTIC_INTERVAL_MS) return;
  lastOpportunisticRun.set(departmentId, now);
  after(async () => {
    // The person in the app sees the in-app warning instead of a push.
    await remindLongRunningTimers({ departmentId, exceptUserId: userId }).catch(() => undefined);
  });
}
