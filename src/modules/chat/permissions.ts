import type { Context } from "@/platform/context";
import { db, type Transaction } from "@/platform/db";
import { HttpError } from "@/platform/http";
import { listValue } from "@/shared/contracts";
import { findRecord } from "@/modules/records/repository";

export async function assertConversation(
  context: Context,
  conversationId: unknown,
  tx: Transaction | typeof db = db,
) {
  if (typeof conversationId !== "string" || !conversationId) return;
  const conversation = await findRecord(context, conversationId, "conversations", tx);
  if (
    conversation.data.mode !== "team" &&
    !listValue(conversation.data.participantIds).includes(context.user.id)
  )
    throw new HttpError(403, "Du bist kein Teilnehmer dieses privaten Chats.");
  return conversation;
}
