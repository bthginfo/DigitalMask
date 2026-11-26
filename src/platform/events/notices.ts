import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { memberships, outbox, records } from "@/platform/db/schema";
import { listValue, textValue, type RecordData } from "@/shared/contracts";
import {
  dutyEntry,
  dutyNoticeMaxSources,
  dutyNoticeWindowMs,
  dutySources,
  mergeDutyNotice,
} from "@/modules/notifications/duty";

type OutboxEvent = typeof outbox.$inferSelect;

/** Events that leave an in-app notification row for each recipient. */
export const noticeEventTypes = new Set([
  "TaskAssignedV1",
  "LeaveRequestDecidedV1",
  "ServiceChangedV1",
  "ShiftSwapChangedV1",
  "LookPublishedV1",
  "AdminDecisionRequestedV1",
]);
/** Chat messages are delivered as push only; unread state comes from `chat_reads`. */
export const chatEventType = "ChatMessageCreatedV1";

/** Recipients by current membership, resolved once when the event is delivered. */
export async function noticeTargets(tx: Transaction, event: OutboxEvent): Promise<string[]> {
  let targets = listValue(event.payload.userIds);
  if (event.type === "AdminDecisionRequestedV1") {
    const excluded = new Set(listValue(event.payload.excludeUserIds));
    const admins = await tx
      .select({ id: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.departmentId, event.departmentId),
          eq(memberships.status, "active"),
          inArray(memberships.role, ["admin", "superadmin"]),
        ),
      );
    return [...new Set(admins.map((admin) => admin.id))].filter((id) => !excluded.has(id));
  }
  if (event.type === chatEventType) {
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
      if (!event.payload.productionId) return activeTeam.map((member) => member.id);
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
      return production
        ? activeTeam
            .filter(
              (member) =>
                member.role !== "user" || !permitted.length || permitted.includes(member.id),
            )
            .map((member) => member.id)
        : [];
    }
    const participants = listValue(conversation?.data.participantIds);
    targets = targets.filter((id) => participants.includes(id));
  }
  if (!targets.length) return [];
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
  return [...new Set(active.map((member) => member.id))];
}

export const noticeId = (event: OutboxEvent, userId: string) => `notice:${event.id}:${userId}`;

function noticeValues(event: OutboxEvent, userId: string, extra: RecordData = {}) {
  const productionId = textValue(event.payload.productionId);
  return {
    id: noticeId(event, userId),
    kind: "notifications" as const,
    organizationId: String(event.payload.organizationId),
    departmentId: event.departmentId,
    createdBy: String(event.payload.actorId),
    ownerId: userId,
    productionId: productionId || null,
    data: {
      type: event.type,
      recordId: event.payload.recordId || "",
      ...(event.payload.conversationId ? { conversationId: event.payload.conversationId } : {}),
      productionId,
      title: String(event.payload.title || "Neue Information"),
      body: String(event.payload.body || ""),
      userId,
      read: false,
      link: String(event.payload.link || ""),
      ...extra,
    },
  };
}

/** Idempotent under at-least-once delivery: the row id is derived from event and recipient. */
export async function insertNotice(tx: Transaction, event: OutboxEvent, userId: string) {
  await tx.insert(records).values(noticeValues(event, userId)).onConflictDoNothing();
  return noticeId(event, userId);
}

/**
 * Painting many shifts would otherwise create one notice and one push per shift. Within
 * `dutyNoticeWindowMs`, further duty changes update the person's unread duty notice into a
 * summary, and only the first notice of a window is pushed.
 * Returns the notice id to push, if any.
 */
export async function upsertDutyNotice(tx: Transaction, event: OutboxEvent, userId: string) {
  // Serialises concurrent workers for this person; ids are locked in sorted order by the caller.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${event.departmentId}:duty-notice:${userId}`}))`,
  );
  const ownId = noticeId(event, userId);
  const recent = await tx
    .select({ id: records.id, data: records.data, version: records.version })
    .from(records)
    .where(
      and(
        eq(records.departmentId, event.departmentId),
        eq(records.ownerId, userId),
        sql`${records.kind} = 'notifications'`,
        sql`${records.data}->>'type' = 'ServiceChangedV1'`,
        gte(records.createdAt, new Date(Date.now() - dutyNoticeWindowMs)),
      ),
    )
    .orderBy(desc(records.createdAt), desc(records.id))
    .limit(20);
  const own = recent.find((row) => row.id === ownId);
  // Redelivery: retry the push only if this event's own notice was the pushed one.
  if (own) return own.data.silent === true ? undefined : ownId;
  if (recent.some((row) => dutySources(row.id, row.data).includes(event.id))) return undefined;
  const latest = recent[0];
  if (
    latest &&
    latest.data.read !== true &&
    dutySources(latest.id, latest.data).length < dutyNoticeMaxSources
  ) {
    const data = mergeDutyNotice(latest, event.id, event.payload);
    if (data)
      await tx
        .update(records)
        .set({ data, version: latest.version + 1, updatedAt: new Date() })
        .where(and(eq(records.id, latest.id), eq(records.version, latest.version)));
    return undefined;
  }
  await tx
    .insert(records)
    .values(
      noticeValues(event, userId, {
        entries: [dutyEntry(event.payload)],
        sourceEventIds: [event.id],
        // A push already went out in this window; the new notice stays in the app.
        ...(latest ? { silent: true } : {}),
      }),
    )
    .onConflictDoNothing();
  return latest ? undefined : ownId;
}
