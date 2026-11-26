import { sql, type SQL } from "drizzle-orm";
import { db } from "@/platform/db";

const day = 86_400_000;
/** Each statement deletes a bounded batch, so the daily cron never holds long locks. */
export const retentionBatchSize = 5_000;
const maxBatchesPerRule = 20;

type Rule = { name: string; table: string; key: string; where: (now: Date) => SQL };
const before = (now: Date, days: number) => new Date(now.getTime() - days * day).toISOString();

/**
 * Data that is only useful for a limited time. Read notices leave the workspace immediately;
 * the outbox only needs finished rows for short diagnosis; audit keeps one year.
 */
export const retentionRules: Rule[] = [
  {
    name: "notificationsRead",
    table: "records",
    key: "id",
    where: (now) =>
      sql`kind = 'notifications' and coalesce(data->>'read','false') = 'true' and created_at < ${before(now, 30)}::timestamptz`,
  },
  {
    name: "notificationsUnread",
    table: "records",
    key: "id",
    where: (now) =>
      sql`kind = 'notifications' and coalesce(data->>'read','false') <> 'true' and created_at < ${before(now, 180)}::timestamptz`,
  },
  {
    name: "outboxDone",
    table: "outbox",
    key: "id",
    where: (now) => sql`status = 'done' and created_at < ${before(now, 14)}::timestamptz`,
  },
  {
    name: "outboxFailed",
    table: "outbox",
    key: "id",
    where: (now) => sql`status = 'failed' and created_at < ${before(now, 90)}::timestamptz`,
  },
  {
    name: "audit",
    table: "audit",
    key: "id",
    where: (now) => sql`created_at < ${before(now, 365)}::timestamptz`,
  },
  {
    // Throttle windows are at most 15 minutes; keep a day for diagnosis.
    name: "rateLimits",
    table: "auth_rate_limit",
    key: "id",
    where: (now) => sql`last_request < ${now.getTime() - day}`,
  },
  {
    name: "sessions",
    table: "app_session",
    key: "id",
    where: (now) => sql`expires_at < ${now.toISOString()}::timestamptz`,
  },
  {
    name: "verifications",
    table: "app_verification",
    key: "id",
    where: (now) => sql`expires_at < ${now.toISOString()}::timestamptz`,
  },
];

export type RetentionResult = { deleted: Record<string, number>; complete: boolean };

/** Batched deletes with a per-rule cap and an overall deadline; the next run continues. */
export async function runRetention(
  now = new Date(),
  deadline = Date.now() + 60_000,
): Promise<RetentionResult> {
  const result: RetentionResult = { deleted: {}, complete: true };
  for (const rule of retentionRules) {
    result.deleted[rule.name] = 0;
    for (let batch = 0; ; batch++) {
      if (batch >= maxBatchesPerRule || Date.now() >= deadline) {
        result.complete = false;
        break;
      }
      const table = sql.identifier(rule.table);
      const key = sql.identifier(rule.key);
      const [row] = await db.execute<{ count: number }>(sql`
        with doomed as (
          select ${key} from ${table} where ${rule.where(now)} limit ${retentionBatchSize}
        ), deleted as (
          delete from ${table} where ${key} in (select ${key} from doomed) returning 1
        )
        select count(*)::int as count from deleted
      `);
      const count = Number(row?.count) || 0;
      result.deleted[rule.name] += count;
      if (count < retentionBatchSize) break;
    }
  }
  return result;
}
