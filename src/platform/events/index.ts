import { after } from "next/server";
import { and, eq, lte, sql, or, ne, inArray } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { outbox, records, audit, memberships } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { invalidateWorkspace } from "@/modules/records/workspace";
import type { RecordData } from "@/shared/contracts";
import { listValue } from "@/shared/contracts";
import { deliverNotifications } from "@/modules/notifications/service";
export async function emit(tx: Transaction, context: Context, type: string, payload: RecordData) {
  await tx.insert(outbox).values({
    id: crypto.randomUUID(),
    departmentId: context.departmentId,
    type,
    payload: { ...payload, actorId: context.user.id, organizationId: context.organizationId },
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
    await processEvents().catch((error) =>
      console.error("Event processing failed", {
        name: error instanceof Error ? error.name : "unknown",
        code: (error as { cause?: { code?: string } })?.cause?.code || "unknown",
      }),
    );
  });
}
export async function processEvents() {
  const changedDepartments = new Set<string>();
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
        .set({ status: "processing", availableAt: new Date(Date.now() + 120000) })
        .where(eq(outbox.id, event.id));
    return list;
  });
  for (const event of due) {
    try {
      const noticeIds: string[] = [];
      if (event.type === "FileDeletionRequestedV1") {
        const [reference] = await db
          .select({ id: records.id })
          .from(records)
          .where(
            and(
              eq(records.kind, "files"),
              sql`${records.data}->>'path'=${String(event.payload.path)}`,
            ),
          )
          .limit(1);
        if (!reference) {
          const { del } = await import("@vercel/blob");
          await del(String(event.payload.path));
        }
      }
      await db.transaction(async (tx) => {
        if (
          event.type === "TaskAssignedV1" ||
          event.type === "LeaveRequestDecidedV1" ||
          event.type === "ServiceChangedV1" ||
          event.type === "LookPublishedV1" ||
          event.type === "ChatMessageCreatedV1"
        ) {
          let targets = Array.isArray(event.payload.userIds)
            ? event.payload.userIds.filter((x): x is string => typeof x === "string")
            : [];
          let targetsChecked = false;
          if (event.type === "ChatMessageCreatedV1") {
            const [conversation] = event.payload.conversationId
              ? await tx
                  .select({ data: records.data })
                  .from(records)
                  .where(
                    and(
                      eq(records.departmentId, event.departmentId),
                      eq(records.id, String(event.payload.conversationId)),
                      eq(records.kind, "conversations"),
                    ),
                  )
                  .limit(1)
              : [];
            const participants = Array.isArray(conversation?.data.participantIds)
              ? conversation.data.participantIds
              : [];
            if (
              conversation?.data.mode === "team" ||
              (!event.payload.conversationId && event.payload.audience === "team")
            ) {
              const activeTeam = await tx
                .select({ id: memberships.userId, role: memberships.role })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.departmentId, event.departmentId),
                    eq(memberships.status, "active"),
                    ne(memberships.role, "superadmin"),
                  ),
                );
              targets = activeTeam.map((member) => member.id);
              targetsChecked = true;
              if (event.payload.productionId) {
                const [production] = await tx
                  .select({ data: records.data })
                  .from(records)
                  .where(
                    and(
                      eq(records.departmentId, event.departmentId),
                      eq(records.id, String(event.payload.productionId)),
                      eq(records.kind, "productions"),
                    ),
                  )
                  .limit(1);
                const permitted = listValue(production?.data.memberIds);
                targets = production
                  ? activeTeam
                      .filter(
                        (member) =>
                          member.role !== "user" ||
                          !permitted.length ||
                          permitted.includes(member.id),
                      )
                      .map((member) => member.id)
                  : [];
              }
            } else {
              targets = targets.filter((id) => participants.includes(id));
            }
          }
          if (targets.length && !targetsChecked) {
            const active = await tx
              .select({ id: memberships.userId })
              .from(memberships)
              .where(
                and(
                  eq(memberships.departmentId, event.departmentId),
                  eq(memberships.status, "active"),
                  inArray(memberships.userId, targets),
                ),
              );
            targets = [...new Set(active.map((member) => member.id))];
          }
          for (const uid of targets) {
            if (uid === event.payload.actorId) continue;
            const noticeId = `notice:${event.id}:${uid}`;
            noticeIds.push(noticeId);
            await tx
              .insert(records)
              .values({
                id: noticeId,
                kind: "notifications",
                organizationId: String(event.payload.organizationId),
                departmentId: event.departmentId,
                createdBy: String(event.payload.actorId),
                ownerId: uid,
                productionId:
                  typeof event.payload.productionId === "string" && event.payload.productionId
                    ? event.payload.productionId
                    : null,
                data: {
                  type: event.type,
                  recordId: event.payload.recordId || "",
                  ...(event.payload.conversationId
                    ? { conversationId: event.payload.conversationId }
                    : {}),
                  productionId:
                    typeof event.payload.productionId === "string"
                      ? event.payload.productionId
                      : "",
                  title: String(event.payload.title || "Neue Information"),
                  body: String(event.payload.body || ""),
                  userId: uid,
                  read: false,
                  link: String(event.payload.link || ""),
                },
              })
              .onConflictDoNothing();
          }
        }
      });
      changedDepartments.add(event.departmentId);
      await deliverNotifications(event.departmentId, event.type, noticeIds);
      await db.update(outbox).set({ status: "done" }).where(eq(outbox.id, event.id));
    } catch (error) {
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
  for (const departmentId of changedDepartments) invalidateWorkspace(departmentId);
  return { processed: due.length };
}
