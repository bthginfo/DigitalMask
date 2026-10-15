import type { Transaction } from "@/platform/db";
import { outbox } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { googleCalendarConfigured } from "./config";

/** Written with the calendar change, delivered only after that transaction commits. */
export async function queueGoogleCalendarSync(tx: Transaction, context: Context) {
  if (!googleCalendarConfigured()) return false;
  await tx
    .insert(outbox)
    .values({
      id: crypto.randomUUID(),
      departmentId: context.departmentId,
      type: "GoogleCalendarSyncRequestedV1",
      payload: { actorId: context.user.id, organizationId: context.organizationId },
    });
  return true;
}
