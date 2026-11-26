import { after } from "next/server";
import { and, eq, lte, sql, or } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { outbox, records, audit } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { invalidateNotifications } from "@/modules/records/workspace";
import type { RecordData } from "@/shared/contracts";
import { deliverChatPush, deliverNotifications } from "@/modules/notifications/service";
import {
  chatEventType,
  insertNotice,
  noticeEventTypes,
  noticeTargets,
  upsertDutyNotice,
} from "./notices";
import { enqueueGoogleCalendarWork } from "@/modules/google-calendar/queue";
/** Who caused an event: a signed-in context, or e.g. a new registration without one. */
export type EventActor = Pick<Context, "departmentId" | "organizationId"> & {
  user: Pick<Context["user"], "id">;
};
export async function emit(
  tx: Transaction | typeof db,
  context: EventActor,
  type: string,
  payload: RecordData,
  options: { availableAt?: Date } = {},
) {
  await tx.insert(outbox).values({
    id: crypto.randomUUID(),
    departmentId: context.departmentId,
    type,
    payload: { ...payload, actorId: context.user.id, organizationId: context.organizationId },
    ...(options.availableAt ? { availableAt: options.availableAt } : {}),
  });
}
export async function auditChange(
  tx: Transaction,
  context: Context,
  action: string,
  recordId?: string,
) {
  await tx.insert(audit).values({
    id: crypto.randomUUID(),
    departmentId: context.departmentId,
    userId: context.user.id,
    action,
    recordId,
  });
}
export function scheduleEvents() {
  after(async () => {
    await drainEvents().catch((error) =>
      console.error("Event processing failed", {
        name: error instanceof Error ? error.name : "unknown",
        code: (error as { cause?: { code?: string } })?.cause?.code || "unknown",
      }),
    );
  });
}
/** Drain bounded continuations in the same invocation, without a recurring database poll. */
export async function drainEvents(deadline = Date.now() + 220000) {
  let processed = 0;
  let nextGoogleAt: number | undefined;
  for (let pass = 0; pass < 8 && Date.now() < deadline - 10000; pass++) {
    const result = await processEvents(deadline);
    processed += result.processed;
    nextGoogleAt = result.nextGoogleAt;
    if (!result.continuation && result.processed < 20) break;
    if (nextGoogleAt && nextGoogleAt > Date.now()) {
      const delay = nextGoogleAt - Date.now();
      if (delay > 45000 || Date.now() + delay > deadline - 20000) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (nextGoogleAt !== undefined) {
    const { continueGoogleCalendarSync } = await import("@/modules/google-calendar/continuation");
    await continueGoogleCalendarSync(nextGoogleAt);
  }
  return { processed };
}
export async function processEvents(deadline = Date.now() + 170000) {
  const noticeRecipients = new Map<string, Set<string>>();
  const calendarBatches = new Map<
    string,
    Promise<import("@/modules/google-calendar/sync").GoogleSyncProgress>
  >();
  const calendarContinuations = new Set<string>();
  let nextGoogleAt: number | undefined;
  const due = await db.transaction(async (tx) => {
    const list = await tx
      .select()
      .from(outbox)
      .where(
        and(
          or(eq(outbox.status, "pending"), eq(outbox.status, "processing")),
          lte(outbox.availableAt, new Date()),
        ),
      )
      .limit(20)
      .for("update", { skipLocked: true });
    for (const event of list)
      await tx
        .update(outbox)
        .set({
          status: "processing",
          availableAt: new Date(
            Date.now() + (event.type === "GoogleCalendarSyncRequestedV1" ? 300000 : 120000),
          ),
        })
        .where(eq(outbox.id, event.id));
    return list;
  });
  for (const event of [...due].sort(
    (a, b) =>
      Number(a.type === "GoogleCalendarSyncRequestedV1") -
      Number(b.type === "GoogleCalendarSyncRequestedV1"),
  )) {
    try {
      const noticeIds: string[] = [];
      if (event.type === "GoogleCalendarSyncRequestedV1") {
        if (!calendarBatches.has(event.departmentId)) {
          const { syncGoogleCalendars } = await import("@/modules/google-calendar/sync");
          calendarBatches.set(
            event.departmentId,
            syncGoogleCalendars(event.departmentId, deadline),
          );
        }
        const progress = await calendarBatches.get(event.departmentId)!;
        if (progress.nextAt !== undefined)
          nextGoogleAt = Math.min(nextGoogleAt ?? Infinity, progress.nextAt);
        if (progress.more && !calendarContinuations.has(event.departmentId)) {
          await enqueueGoogleCalendarWork(
            db,
            event.departmentId,
            event.payload,
            new Date(progress.nextAt ?? Date.now() + 1800000),
          );
          calendarContinuations.add(event.departmentId);
        }
        await db.update(outbox).set({ status: "done" }).where(eq(outbox.id, event.id));
        continue;
      }
      if (event.type === "FileDeletionRequestedV1") {
        // Copied productions share blob paths: delete the blob only when no file row remains.
        const [reference] = await db
          .select({ id: records.id })
          .from(records)
          .where(
            and(
              eq(records.departmentId, event.departmentId),
              sql`${records.kind} = 'files'`,
              sql`${records.data}->>'path'=${String(event.payload.path)}`,
            ),
          )
          .limit(1);
        if (!reference) {
          const { del } = await import("@vercel/blob");
          await del(String(event.payload.path));
          if (
            event.payload.fileId &&
            /\.(?:docx|xlsx|csv|pdf)$/i.test(String(event.payload.path))
          ) {
            const { clearDocumentCache } = await import("@/modules/documents/storage");
            const { liveConfigured } = await import("@/platform/realtime");
            if (liveConfigured()) await clearDocumentCache(String(event.payload.fileId));
          }
        }
      }
      const chatRecipients: string[] = [];
      if (noticeEventTypes.has(event.type) || event.type === chatEventType)
        await db.transaction(async (tx) => {
          const targets = (await noticeTargets(tx, event))
            .filter((uid) => uid !== event.payload.actorId)
            .sort();
          for (const uid of targets) {
            if (event.type === chatEventType) {
              chatRecipients.push(uid);
              continue;
            }
            if (!noticeRecipients.has(event.departmentId))
              noticeRecipients.set(event.departmentId, new Set());
            noticeRecipients.get(event.departmentId)!.add(uid);
            if (event.type === "ServiceChangedV1") {
              const pushed = await upsertDutyNotice(tx, event, uid);
              if (pushed) noticeIds.push(pushed);
            } else noticeIds.push(await insertNotice(tx, event, uid));
          }
        });
      if (event.type === chatEventType)
        await deliverChatPush(event.departmentId, event.id, chatRecipients, event.payload);
      else await deliverNotifications(event.departmentId, event.type, noticeIds);
      await db.update(outbox).set({ status: "done" }).where(eq(outbox.id, event.id));
    } catch (error) {
      if (event.type === "GoogleCalendarSyncRequestedV1") {
        await db.transaction(async (tx) => {
          await tx
            .update(outbox)
            .set({ status: event.attempts >= 5 ? "failed" : "done" })
            .where(eq(outbox.id, event.id));
          if (event.attempts < 5)
            await enqueueGoogleCalendarWork(
              tx,
              event.departmentId,
              event.payload,
              new Date(Date.now() + Math.min(3600000, 60000 * 2 ** event.attempts)),
              event.attempts + 1,
            );
        });
        console.error("Google sync delivery failed", {
          name: error instanceof Error ? error.name : "unknown",
        });
        continue;
      }
      await db
        .update(outbox)
        .set({
          attempts: event.attempts + 1,
          status: event.attempts >= 5 ? "failed" : "pending",
          availableAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** event.attempts)),
        })
        .where(eq(outbox.id, event.id));
      console.error("Event delivery failed", event.id, {
        name: error instanceof Error ? error.name : "unknown",
        code: (error as { cause?: { code?: string } })?.cause?.code || "unknown",
      });
    }
  }
  // Background work: no browser tab wrote these changes, so no echo origin.
  for (const [departmentId, userIds] of noticeRecipients)
    invalidateNotifications(departmentId, [...userIds], { origin: null });
  return { processed: due.length, continuation: calendarContinuations.size > 0, nextGoogleAt };
}
