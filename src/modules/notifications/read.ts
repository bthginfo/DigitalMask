import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/platform/db";
import { chatReads, records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { assertConversation } from "@/modules/chat/permissions";
import { findRecord, projectVisible, unreadNoticeCondition } from "@/modules/records/repository";
import { invalidateChatReads, invalidateNotifications } from "@/modules/records/workspace";
import { chatChoiceKey } from "@/modules/chat/channel-order";
import { HttpError } from "@/platform/http";

/** Acknowledge the caller's visible snapshot in one write; later arrivals stay unread. */
export async function readNotifications(context: Context, input: unknown) {
  const { ids } = z
    .object({ ids: z.array(z.string().min(1).max(200)).max(20_000) })
    .strict()
    .parse(input);
  if (!ids.length) return { read: 0 };
  const updated = await db
    .update(records)
    .set({
      data: sql`${records.data} || '{"read":true}'::jsonb`,
      version: sql`${records.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(records.organizationId, context.organizationId),
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "notifications"),
        eq(records.ownerId, context.user.id),
        sql`${records.data}->>'userId' = ${context.user.id}`,
        inArray(records.id, [...new Set(ids)]),
        sql`coalesce(${records.data}->>'read','false') <> 'true'`,
      ),
    )
    .returning({ id: records.id });
  if (updated.length) invalidateNotifications(context.departmentId, [context.user.id]);
  return { read: updated.length };
}

/**
 * Moves the caller's read cursor of one chat forward (never backwards) and acknowledges legacy
 * chat notification rows of that chat. Only the caller's own caches are renewed: reading a
 * chat never sends a department-wide live signal.
 */
export async function readChatNotifications(context: Context, input: unknown) {
  const data = z
    .object({
      conversationId: z.string().max(100).default(""),
      productionId: z.string().max(100).default(""),
      /** Creation time of the newest message the reader has seen; defaults to now. */
      readAt: z.iso.datetime({ offset: true }).optional(),
    })
    .strict()
    .parse(input);
  if (data.conversationId && data.productionId)
    throw new HttpError(400, "Bitte wähle genau einen Chat.");
  if (data.conversationId) await assertConversation(context, data.conversationId);
  else if (
    data.productionId &&
    !projectVisible(context, await findRecord(context, data.productionId, "productions"))
  )
    throw new HttpError(403, "Keine Berechtigung für diese Produktion.");
  const now = new Date();
  // Serialized createdAt values are rounded down to milliseconds; PostgreSQL keeps microseconds.
  const requested = data.readAt ? new Date(Date.parse(data.readAt) + 1) : now;
  const readAt = requested > now ? now : requested;
  const channelKey = chatChoiceKey(data.conversationId, data.productionId);
  const cursor = await db
    .insert(chatReads)
    .values({
      departmentId: context.departmentId,
      userId: context.user.id,
      channelKey,
      lastReadAt: readAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [chatReads.departmentId, chatReads.userId, chatReads.channelKey],
      set: { lastReadAt: readAt, updatedAt: now },
      setWhere: sql`${chatReads.lastReadAt} < ${readAt.toISOString()}::timestamptz`,
    })
    .returning({ lastReadAt: chatReads.lastReadAt });
  if (cursor.length) invalidateChatReads(context.departmentId, context.user.id);
  // Rows created before read cursors existed; new chat messages no longer create any.
  const updated = await db
    .update(records)
    .set({
      data: sql`${records.data} || '{"read":true}'::jsonb`,
      version: sql`${records.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.ownerId, context.user.id),
        unreadNoticeCondition,
        sql`(${records.data}->>'type'='ChatMessageCreatedV1' or ${records.data}->>'title' like 'Neue private Nachricht%' or ${records.data}->>'title' like 'Neue Nachricht%')`,
        sql`coalesce(${records.data}->>'conversationId','') = ${data.conversationId}`,
        ...(data.conversationId
          ? []
          : [sql`coalesce(${records.data}->>'productionId','') = ${data.productionId}`]),
      ),
    )
    .returning({ id: records.id });
  if (updated.length) {
    // The legacy row changes the reader's own unread chat state too.
    invalidateNotifications(context.departmentId, [context.user.id], { broadcast: false });
    invalidateChatReads(context.departmentId, context.user.id);
  }
  return { read: updated.length, cursor: cursor.length > 0 };
}
