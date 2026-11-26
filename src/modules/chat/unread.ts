import { sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { listValue, type Role } from "@/shared/contracts";

/**
 * Chat notification rows were replaced by per-channel read cursors (`chat_reads`). A channel
 * without a cursor counts as read up to the reader's newest READ legacy chat notification of
 * that channel, otherwise up to this release date (or the account's creation, if later), so
 * existing users do not suddenly see every older message as unread.
 */
export const chatReadCursorsSince = new Date("2026-11-26T00:00:00.000Z");

export type ChatUnreadRow = { userId: string; channelKey: string; unread: number };

/** `chatChoiceKey` in SQL. Exactly one chat: a conversation, a production or the general room. */
export const messageChannelKey = (alias: string): SQL =>
  sql.raw(
    `case when coalesce(${alias}.data->>'conversationId','') <> '' then 'conversation:' || (${alias}.data->>'conversationId') when coalesce(${alias}.data->>'productionId','') <> '' then 'production:' || (${alias}.data->>'productionId') else 'general' end`,
  );

/** Matches the legacy notification rows that `isChatNotice` recognises. */
const legacyChatNotice = sql.raw(
  `(n.data->>'type' = 'ChatMessageCreatedV1' or n.data->>'title' like 'Neue private Nachricht%' or n.data->>'title' like 'Neue Nachricht%')`,
);

/**
 * Unread messages from other people per user and channel, in one indexed query. Visibility is
 * applied by the caller (`visibleChatUnread`), which already knows the reader's chats.
 */
export async function chatUnreadRows(
  departmentId: string,
  userIds: readonly string[],
  tx: Transaction | typeof db = db,
): Promise<ChatUnreadRow[]> {
  const people = [...new Set(userIds)];
  if (!people.length) return [];
  const list = sql.join(
    people.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await tx.execute<{ user_id: string; channel_key: string; unread: number }>(sql`
    with people as (
      select u.id as user_id, greatest(u.created_at, ${chatReadCursorsSince.toISOString()}::timestamptz) as fallback
      from app_user u where u.id in (${list})
    ), legacy as (
      select n.owner_id as user_id, ${messageChannelKey("n")} as channel_key, max(n.created_at) as last_read_at
      from records n
      where n.department_id = ${departmentId} and n.kind = 'notifications' and n.owner_id in (${list})
        and coalesce(n.data->>'read','false') = 'true' and ${legacyChatNotice}
      group by 1, 2
    ), cursors as (
      select coalesce(r.user_id, l.user_id) as user_id, coalesce(r.channel_key, l.channel_key) as channel_key,
        coalesce(r.last_read_at, l.last_read_at) as last_read_at
      from (select user_id, channel_key, last_read_at from chat_reads
            where department_id = ${departmentId} and user_id in (${list})) r
      full join legacy l on l.user_id = r.user_id and l.channel_key = r.channel_key
    ), floor as (
      select least((select min(last_read_at) from cursors), (select min(fallback) from people)) as since
    ), recent as (
      select m.created_by, m.created_at, ${messageChannelKey("m")} as channel_key
      from records m
      where m.department_id = ${departmentId} and m.kind = 'messages'
        and m.created_at > (select since from floor)
    )
    select p.user_id, m.channel_key, count(*)::int as unread
    from people p
    join recent m on m.created_by <> p.user_id
    left join cursors c on c.user_id = p.user_id and c.channel_key = m.channel_key
    where m.created_at > coalesce(c.last_read_at, p.fallback)
    group by p.user_id, m.channel_key
  `);
  return [...rows].map((row) => ({
    userId: row.user_id,
    channelKey: row.channel_key,
    unread: Number(row.unread) || 0,
  }));
}

export type ChatVisibility = {
  user: { id: string; role: Role };
  /** Conversations in this department by id (mode and participants). */
  conversation: (id: string) => { data: Record<string, unknown> } | undefined;
  /** Whether the reader may open this production. */
  production: (id: string) => boolean;
};

/**
 * Same audience as the former chat notifications: private chats for their participants, team
 * rooms and production chats for active non-superadmin members with production access.
 */
export function chatChannelVisible(channelKey: string, access: ChatVisibility) {
  const superadmin = access.user.role === "superadmin";
  if (channelKey === "general") return !superadmin;
  const [kind, id] = [
    channelKey.slice(0, channelKey.indexOf(":")),
    channelKey.slice(channelKey.indexOf(":") + 1),
  ];
  if (kind === "production") return !superadmin && access.production(id);
  if (kind !== "conversation") return false;
  const conversation = access.conversation(id);
  if (!conversation) return false;
  if (conversation.data.mode === "team") return !superadmin;
  return listValue(conversation.data.participantIds).includes(access.user.id);
}

export function visibleChatUnread(
  rows: readonly ChatUnreadRow[],
  access: ChatVisibility,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows)
    if (
      row.userId === access.user.id &&
      row.unread > 0 &&
      chatChannelVisible(row.channelKey, access)
    )
      result[row.channelKey] = row.unread;
  return result;
}

export const chatUnreadTotal = (counts: Record<string, number> | undefined) =>
  Object.values(counts || {}).reduce((total, count) => total + Math.max(0, count), 0);
