import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache, revalidateTag } from "next/cache";
import webpush from "web-push";
import { db } from "@/platform/db";
import { memberships, pushSubscriptions, records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { listValue, type RecordData } from "@/shared/contracts";
import { unreadNoticeCondition } from "@/modules/records/repository";
import { chatUnreadRows, chatUnreadTotal, visibleChatUnread } from "@/modules/chat/unread";
import { subscriptionSchema } from "./schema";
import { pushPayload } from "./payload";
import { isChatNotice } from "./unread";

export const pushConfigured = () =>
  Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );
export const subscriptionId = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");
const tag = (departmentId: string) => `push-devices:${departmentId}`;
function invalidateDevices(departmentId: string) {
  revalidateTag(tag(departmentId), { expire: 0 });
}
export function departmentDevices(departmentId: string) {
  return unstable_cache(
    async () =>
      (
        await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.departmentId, departmentId))
      ).map((device) => ({
        ...device,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      })),
    ["push-devices-v1", departmentId],
    { revalidate: 3600, tags: [tag(departmentId)] },
  )();
}
export async function subscribeDevice(context: Context, input: unknown) {
  if (!pushConfigured())
    throw new HttpError(
      503,
      "Mitteilungen werden gerade eingerichtet. Bitte versuche es später erneut.",
    );
  const subscription = subscriptionSchema.parse(input);
  const id = subscriptionId(subscription.endpoint);
  let previousDepartment: string | undefined;
  await db.transaction(async (tx) => {
    // Serialize device registrations for this account and keep its device count bounded.
    await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, context.user.id),
          eq(memberships.departmentId, context.departmentId),
        ),
      )
      .for("update");
    const own = await tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, context.user.id));
    if (own.length >= 10 && !own.some((device) => device.id === id))
      throw new HttpError(
        409,
        "Du hast bereits zehn Geräte aktiviert. Deaktiviere zuerst ein anderes Gerät.",
      );
    const [previous] = await tx
      .select({ departmentId: pushSubscriptions.departmentId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.id, id));
    previousDepartment = previous?.departmentId;
    await tx
      .insert(pushSubscriptions)
      .values({
        id,
        userId: context.user.id,
        departmentId: context.departmentId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.id,
        set: {
          userId: context.user.id,
          departmentId: context.departmentId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          updatedAt: new Date(),
        },
      });
  });
  if (previousDepartment && previousDepartment !== context.departmentId)
    invalidateDevices(previousDepartment);
  invalidateDevices(context.departmentId);
}
export async function unsubscribeDevice(context: Context, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.id, subscriptionId(endpoint)),
        eq(pushSubscriptions.userId, context.user.id),
        eq(pushSubscriptions.departmentId, context.departmentId),
      ),
    );
  invalidateDevices(context.departmentId);
}
export async function send(
  device: Awaited<ReturnType<typeof departmentDevices>>[number],
  payload: ReturnType<typeof pushPayload>,
) {
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: device.keys },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT!,
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
        TTL: 3600,
        timeout: 8000,
        urgency: "normal",
        topic: createHash("sha256").update(payload.tag).digest("base64url").slice(0, 32),
      },
    );
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, device.id),
            eq(pushSubscriptions.userId, device.userId),
            eq(pushSubscriptions.updatedAt, new Date(device.updatedAt)),
          ),
        );
      invalidateDevices(device.departmentId);
      return false;
    }
    // Do not log endpoints, device keys or provider response bodies.
    throw new Error("Mitteilungsdienst vorübergehend nicht erreichbar.");
  }
  return true;
}
export async function testDevice(context: Context, endpoint: string) {
  const device = (await departmentDevices(context.departmentId)).find(
    (device) => device.id === subscriptionId(endpoint) && device.userId === context.user.id,
  );
  if (!device || !pushConfigured())
    throw new HttpError(409, "Aktiviere zuerst Mitteilungen auf diesem Gerät.");
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.ownerId, context.user.id),
        unreadNoticeCondition,
      ),
    );
  const payload = {
    ...pushPayload("test", "digitalmask-test", context.user.id, count[0]?.count || 0, {
      link: "/?module=settings",
    }),
    title: "DigitalMask · Mitteilungen sind aktiv",
    body: "Dieses Gerät empfängt jetzt Mitteilungen.",
  };
  if (!(await send(device, payload)))
    throw new HttpError(409, "Die Geräteverbindung ist abgelaufen. Aktiviere Mitteilungen erneut.");
}

/**
 * Current unread notices (without legacy chat rows) plus unread chat messages per recipient,
 * restricted to chats and productions the recipient may still open. One batch of queries.
 */
async function unreadBadges(departmentId: string, recipientIds: string[]) {
  const [rows, chats] = await Promise.all([
    db
      .select({ notice: records, role: memberships.role, status: memberships.status })
      .from(records)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, records.ownerId),
          eq(memberships.departmentId, records.departmentId),
        ),
      )
      .where(
        and(
          eq(records.departmentId, departmentId),
          inArray(records.ownerId, recipientIds),
          eq(memberships.status, "active"),
          unreadNoticeCondition,
        ),
      ),
    chatUnreadRows(departmentId, recipientIds),
  ]);
  const roles = new Map(rows.map(({ notice, role }) => [notice.ownerId!, role]));
  if (chats.length) {
    const missing = recipientIds.filter((id) => !roles.has(id));
    if (missing.length)
      for (const member of await db
        .select({ id: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.departmentId, departmentId),
            eq(memberships.status, "active"),
            inArray(memberships.userId, missing),
          ),
        ))
        roles.set(member.id, member.role);
  }
  const relationIds = [
    ...new Set(
      [
        ...rows.flatMap(({ notice }) => [
          String(notice.data.conversationId || ""),
          String(notice.data.productionId || ""),
        ]),
        ...chats.map((chat) => chat.channelKey.slice(chat.channelKey.indexOf(":") + 1)),
      ].filter(Boolean),
    ),
  ];
  const related = relationIds.length
    ? await db
        .select()
        .from(records)
        .where(and(eq(records.departmentId, departmentId), inArray(records.id, relationIds)))
    : [];
  const visible = rows.filter(({ notice, role, status }) => {
    if (status !== "active") return false;
    if (notice.data.conversationId) {
      const conversation = related.find(
        (row) => row.id === notice.data.conversationId && row.kind === "conversations",
      );
      if (
        !conversation ||
        (conversation.data.mode !== "team" &&
          !listValue(conversation.data.participantIds).includes(notice.ownerId!))
      )
        return false;
    }
    if (notice.data.productionId) {
      const production = related.find(
        (row) => row.id === notice.data.productionId && row.kind === "productions",
      );
      if (
        !production ||
        (role === "user" &&
          listValue(production.data.memberIds).length &&
          !listValue(production.data.memberIds).includes(notice.ownerId!))
      )
        return false;
    }
    return true;
  });
  const counts = new Map<string, number>();
  for (const { notice } of visible)
    if (!isChatNotice(notice)) counts.set(notice.ownerId!, (counts.get(notice.ownerId!) || 0) + 1);
  for (const userId of recipientIds) {
    const role = roles.get(userId);
    if (!role) continue;
    const unread = visibleChatUnread(chats, {
      user: { id: userId, role },
      conversation: (id) => related.find((row) => row.id === id && row.kind === "conversations"),
      production: (id) => {
        const production = related.find((row) => row.id === id && row.kind === "productions");
        return (
          !!production &&
          (role !== "user" ||
            !listValue(production.data.memberIds).length ||
            listValue(production.data.memberIds).includes(userId))
        );
      },
    });
    const total = chatUnreadTotal(unread);
    if (total) counts.set(userId, (counts.get(userId) || 0) + total);
  }
  return { visible, counts };
}

/** Event-driven only. One batch of recipient permissions/notices, using a cached device registry. */
export async function deliverNotifications(
  departmentId: string,
  type: string,
  noticeIds: string[],
) {
  if (!pushConfigured() || !noticeIds.length) return;
  const devices = await departmentDevices(departmentId);
  if (!devices.length) return;
  const recipientIds = [...new Set(devices.map((device) => device.userId))];
  const { visible, counts } = await unreadBadges(departmentId, recipientIds);
  let failed = false;
  for (const { notice } of visible.filter(({ notice }) => noticeIds.includes(notice.id))) {
    const payload = pushPayload(
      type,
      notice.id,
      notice.ownerId!,
      counts.get(notice.ownerId!) || 0,
      notice.data,
    );
    const results = await Promise.allSettled(
      devices
        .filter((device) => device.userId === notice.ownerId)
        .map((device) => send(device, payload)),
    );
    if (results.some((result) => result.status === "rejected")) failed = true;
  }
  if (failed) throw new Error("Push delivery will be retried by the event outbox.");
}

/**
 * Chat messages keep no notification row: the push goes to the recipients resolved by the
 * worker (current chat and production access), with the same lock-screen-safe payload.
 */
export async function deliverChatPush(
  departmentId: string,
  eventId: string,
  userIds: string[],
  data: RecordData,
) {
  if (!pushConfigured() || !userIds.length) return;
  const devices = await departmentDevices(departmentId);
  const recipients = [...new Set(userIds)].filter((id) =>
    devices.some((device) => device.userId === id),
  );
  if (!recipients.length) return;
  const { counts } = await unreadBadges(departmentId, recipients);
  const target = {
    type: "ChatMessageCreatedV1",
    recordId: data.recordId || "",
    conversationId: data.conversationId || "",
    productionId: data.productionId || "",
    link: data.link || "",
  };
  let failed = false;
  for (const userId of recipients) {
    const payload = pushPayload(
      "ChatMessageCreatedV1",
      `notice:${eventId}:${userId}`,
      userId,
      Math.max(1, counts.get(userId) || 0),
      target,
    );
    const results = await Promise.allSettled(
      devices.filter((device) => device.userId === userId).map((device) => send(device, payload)),
    );
    if (results.some((result) => result.status === "rejected")) failed = true;
  }
  if (failed) throw new Error("Push delivery will be retried by the event outbox.");
}
