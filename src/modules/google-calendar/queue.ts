import { sql } from "drizzle-orm";
import type { Database, Transaction } from "@/platform/db";
import { outbox } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import type { RecordData } from "@/shared/contracts";
import { googleCalendarConfigured } from "./config";

/** Coalesces queued work in one statement. Leases and mapping IDs also tolerate concurrent inserts. */
export async function enqueueGoogleCalendarWork(
  connection: Database | Transaction,
  departmentId: string,
  payload: RecordData,
  availableAt = new Date(),
  attempts = 0,
  bringForward = false,
) {
  const timestamp = availableAt.toISOString();
  const scope = sql`${outbox.departmentId}=${departmentId} and ${outbox.type}='GoogleCalendarSyncRequestedV1' and ${outbox.status}='pending'`;
  const pending = bringForward
    ? sql`update ${outbox} set available_at=least(${outbox.availableAt}, ${timestamp}::timestamptz) where ${scope} returning id`
    : sql`select id from ${outbox} where ${scope}`;
  await connection.execute(sql`with pending as (${pending})
    insert into ${outbox} (id, department_id, type, payload, attempts, status, available_at)
    select ${crypto.randomUUID()}, ${departmentId}, 'GoogleCalendarSyncRequestedV1', ${JSON.stringify(payload)}::jsonb, ${attempts}, 'pending', ${timestamp}::timestamptz
    where not exists (select 1 from pending)`);
}

/** Written with the calendar change, delivered only after that transaction commits. */
export async function queueGoogleCalendarSync(tx: Transaction, context: Context) {
  if (!googleCalendarConfigured()) return false;
  await enqueueGoogleCalendarWork(
    tx,
    context.departmentId,
    { actorId: context.user.id, organizationId: context.organizationId },
    new Date(),
    0,
    true,
  );
  return true;
}
