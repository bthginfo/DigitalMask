import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { assertConversation } from "@/modules/chat/permissions";
import { findRecord, projectVisible } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { HttpError } from "@/platform/http";
export async function readChatNotifications(context: Context, input: unknown) {
  const data = z
    .object({
      conversationId: z.string().max(100).default(""),
      productionId: z.string().max(100).default(""),
    })
    .strict()
    .parse(input);
  if (data.conversationId) await assertConversation(context, data.conversationId);
  else if (
    data.productionId &&
    !projectVisible(context, await findRecord(context, data.productionId, "productions"))
  )
    throw new HttpError(403, "Keine Berechtigung für diese Produktion.");
  const updated = await db
    .update(records)
    .set({
      data: sql`${records.data} || '{"read":true}'::jsonb`,
      version: sql`${records.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "notifications"),
        eq(records.ownerId, context.user.id),
        sql`coalesce(${records.data}->>'read','false') <> 'true'`,
        sql`(${records.data}->>'type'='ChatMessageCreatedV1' or ${records.data}->>'title' like 'Neue private Nachricht%' or ${records.data}->>'title' like 'Neue Nachricht%')`,
        sql`coalesce(${records.data}->>'conversationId','') = ${data.conversationId}`,
        ...(data.conversationId
          ? []
          : [sql`coalesce(${records.data}->>'productionId','') = ${data.productionId}`]),
      ),
    )
    .returning({ id: records.id });
  if (updated.length) invalidateWorkspace(context.departmentId, false);
  return { read: updated.length };
}
