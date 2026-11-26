import { unstable_cache, revalidateTag } from "next/cache";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import {
  records,
  memberships,
  user,
  timers,
  attendanceTimers,
  profilePreferences,
} from "@/platform/db/schema";
import { scopeTag, type Context } from "@/platform/context";
import {
  recordKinds,
  type DomainRecord,
  type Workspace,
  type RecordKind,
  listValue,
} from "@/shared/contracts";
import { serialize, projectVisible, unreadNoticeCondition } from "./repository";
import { scheduleLiveChange, type LiveChangeOptions } from "@/platform/realtime";
import { canReadShiftSwap } from "@/modules/shift-swaps/rules";
import { messageInChat, workspaceMessageLimit, type ChatScope } from "@/modules/chat/media";
import { visibleWorkingTime } from "@/shared/working-time";
import { calendarProductionReference } from "@/shared/calendar-access";
import { productionOverviewReference } from "@/shared/production-overview";
import { chatUnreadRows, visibleChatUnread } from "@/modules/chat/unread";
import {
  chatReadUserTag,
  chatUnreadKinds,
  workspaceGroups,
  workspaceKindTag,
  notificationUserTag,
  yearBucketedGroups,
  type WorkspaceGroup,
} from "@/shared/workspace-sync";
export function invalidateWorkspace(
  departmentId: string,
  broadcast = true,
  kinds?: readonly RecordKind[],
  options?: LiveChangeOptions,
) {
  const tags = kinds?.map((kind) => workspaceKindTag(departmentId, kind)) ?? [
    scopeTag(departmentId),
  ];
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
  if (broadcast) scheduleLiveChange(departmentId, kinds, options);
}
export function invalidateNotifications(
  departmentId: string,
  userIds: readonly string[],
  { broadcast = true, ...options }: LiveChangeOptions & { broadcast?: boolean } = {},
) {
  for (const userId of new Set(userIds))
    revalidateTag(notificationUserTag(departmentId, userId), { expire: 0 });
  if (userIds.length && broadcast) scheduleLiveChange(departmentId, ["notifications"], options);
}
/** A personal read cursor only affects the reader: no department-wide signal. */
export function invalidateChatReads(departmentId: string, userId: string) {
  revalidateTag(chatReadUserTag(departmentId, userId), { expire: 0 });
}
export function invalidateTeam(departmentId: string) {
  revalidateTag(`team:${departmentId}`, { expire: 0 });
}
export function invalidateTimer(userId: string) {
  revalidateTag(`timers:${userId}`, { expire: 0 });
}
/** Shared department snapshots; the README documents the same window. */
export const sharedCacheSeconds = 300;
/** Next.js silently skips data-cache entries above 2 MB in production. */
const cacheEntryWarningBytes = 1.5 * 1024 * 1024;
const warnedEntries = new Set<string>();
/** unstable_cache stores the JSON result as a string inside a JSON envelope (escaped size). */
export function cacheEntryBytes(value: unknown) {
  const raw = JSON.stringify(value) ?? "";
  return raw.length > cacheEntryWarningBytes / 2 ? JSON.stringify(raw).length : raw.length;
}
function warnLargeEntry(key: readonly string[], value: unknown) {
  const id = key.join(":");
  if (warnedEntries.has(id)) return;
  const bytes = cacheEntryBytes(value);
  if (bytes <= cacheEntryWarningBytes) return;
  warnedEntries.add(id);
  // Only cache keys and sizes: no record contents.
  console.warn("Workspace cache entry approaches the 2 MB data-cache limit", { key: id, bytes });
}
function sharedEntry<T>(
  read: () => Promise<T>,
  key: string[],
  departmentId: string,
  kinds: readonly RecordKind[],
) {
  return unstable_cache(
    async () => {
      const value = await read();
      warnLargeEntry(key, value);
      return value;
    },
    key,
    {
      revalidate: sharedCacheSeconds,
      tags: [scopeTag(departmentId), ...kinds.map((kind) => workspaceKindTag(departmentId, kind))],
    },
  )();
}
const yearStart = (year: number) => new Date(Date.UTC(year, 0, 1));
async function readScope(departmentId: string, kinds: readonly RecordKind[], year?: number) {
  const rows = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, departmentId),
        inArray(records.kind, [...kinds]),
        year === undefined ? undefined : gte(records.createdAt, yearStart(year)),
        year === undefined ? undefined : lt(records.createdAt, yearStart(year + 1)),
      ),
    )
    .orderBy(records.createdAt, records.id);
  return rows.map(serialize);
}
/** Calendar years (UTC, by immutable created_at) that currently hold rows of these kinds. */
async function readScopeYears(departmentId: string, kinds: readonly RecordKind[]) {
  const rows = await db
    .select({ year: sql<number>`extract(year from ${records.createdAt} at time zone 'UTC')::int` })
    .from(records)
    .where(and(eq(records.departmentId, departmentId), inArray(records.kind, [...kinds])))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((row) => Number(row.year)).filter(Number.isInteger);
}
/** Same rows and order as one unbucketed snapshot, cached as one entry per created_at year. */
export async function readBucketedScope(
  departmentId: string,
  group: string,
  kinds: readonly RecordKind[],
) {
  const years = await sharedEntry(
    () => readScopeYears(departmentId, kinds),
    ["department-group-years-v1", departmentId, group],
    departmentId,
    kinds,
  );
  const buckets = await Promise.all(
    years.map((year) =>
      sharedEntry(
        () => readScope(departmentId, kinds, year),
        ["department-group-v8", departmentId, group, String(year)],
        departmentId,
        kinds,
      ),
    ),
  );
  return buckets.flat();
}
/**
 * Only the newest messages of each chat (conversation, production chat or general room) can
 * appear in the workspace, which keeps at most the newest `workspaceMessageLimit` visible ones.
 */
async function readRecentMessages(departmentId: string) {
  const rows = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, departmentId),
        eq(records.kind, "messages"),
        sql`${records.id} in (select ranked.id from (select id, row_number() over (partition by coalesce(data->>'conversationId',''), coalesce(data->>'productionId','') order by created_at desc, id desc) as channel_rank from records where department_id = ${departmentId} and kind = 'messages') ranked where ranked.channel_rank <= ${workspaceMessageLimit})`,
      ),
    )
    .orderBy(records.createdAt, records.id);
  return rows.map(serialize);
}
/** The complete history of one chat, e.g. for its media gallery. */
async function readChannelMessages(departmentId: string, scope: ChatScope) {
  const rows = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, departmentId),
        eq(records.kind, "messages"),
        sql`coalesce(${records.data}->>'conversationId','') = ${scope.conversationId}`,
        sql`coalesce(${records.data}->>'productionId','') = ${scope.productionId}`,
      ),
    )
    .orderBy(records.createdAt, records.id);
  return rows.map(serialize);
}
function readGroup(
  departmentId: string,
  group: WorkspaceGroup,
  kinds: readonly RecordKind[],
  chatScope?: ChatScope,
) {
  if (group === "messages")
    return chatScope
      ? sharedEntry(
          () => readChannelMessages(departmentId, chatScope),
          ["chat-channel-v1", departmentId, chatScope.conversationId, chatScope.productionId],
          departmentId,
          kinds,
        )
      : sharedEntry(
          () => readRecentMessages(departmentId),
          ["department-messages-v1", departmentId],
          departmentId,
          kinds,
        );
  if (yearBucketedGroups.includes(group)) return readBucketedScope(departmentId, group, kinds);
  return sharedEntry(
    () => readScope(departmentId, kinds),
    ["department-group-v8", departmentId, group],
    departmentId,
    kinds,
  );
}
async function readWorkspaceRows(
  context: Context,
  selected?: readonly RecordKind[],
  chatScope?: ChatScope,
) {
  const wanted = selected
    ? new Set<RecordKind>([...selected, "productions", "conversations"])
    : null;
  const groups = (
    Object.entries(workspaceGroups) as [WorkspaceGroup, readonly RecordKind[]][]
  ).filter(([, kinds]) => !wanted || kinds.some((kind) => wanted.has(kind)));
  const snapshots = await Promise.all(
    groups.map(([group, kinds]) => readGroup(context.departmentId, group, kinds, chatScope)),
  );
  const notices =
    !wanted || wanted.has("notifications")
      ? await unstable_cache(
          async () =>
            (
              await db
                .select()
                .from(records)
                .where(
                  and(
                    eq(records.departmentId, context.departmentId),
                    eq(records.ownerId, context.user.id),
                    unreadNoticeCondition,
                    sql`${records.data}->>'userId' = ${context.user.id}`,
                  ),
                )
                .orderBy(records.createdAt)
            ).map(serialize),
          ["personal-unread-v2", context.departmentId, context.user.id],
          {
            revalidate: 3600,
            tags: [
              scopeTag(context.departmentId),
              workspaceKindTag(context.departmentId, "notifications"),
              notificationUserTag(context.departmentId, context.user.id),
            ],
          },
        )()
      : [];
  return [...snapshots.flat().filter((row) => !wanted || wanted.has(row.kind)), ...notices];
}
/** Personal unread chat counters, outside the shared snapshots; renewed by messages and reads. */
function readChatUnread(context: Context) {
  return unstable_cache(
    () => chatUnreadRows(context.departmentId, [context.user.id]),
    ["personal-chat-unread-v1", context.departmentId, context.user.id],
    {
      revalidate: sharedCacheSeconds,
      tags: [
        scopeTag(context.departmentId),
        workspaceKindTag(context.departmentId, "messages"),
        chatReadUserTag(context.departmentId, context.user.id),
      ],
    },
  )();
}
async function readTeam(departmentId: string) {
  const members = await unstable_cache(
    () =>
      db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          role: memberships.role,
          status: memberships.status,
          workingTime: profilePreferences.workingTime,
        })
        .from(memberships)
        .innerJoin(user, eq(memberships.userId, user.id))
        .leftJoin(profilePreferences, eq(profilePreferences.userId, memberships.userId))
        .where(eq(memberships.departmentId, departmentId)),
    ["department-team-v4", departmentId],
    { revalidate: 3600, tags: [`team:${departmentId}`] },
  )();
  return members.map((m) => ({ ...m, username: m.username || "" }));
}
export async function getWorkspace(
  context: Context,
  selected?: readonly RecordKind[],
  chatArchive?: ChatScope,
): Promise<Workspace> {
  const [rows, members, unreadChats] = await Promise.all([
    readWorkspaceRows(context, selected, chatArchive),
    readTeam(context.departmentId),
    !selected || selected.some((kind) => chatUnreadKinds.includes(kind))
      ? readChatUnread(context)
      : undefined,
  ]);
  const visibleProjects = new Set(
    rows.filter((r) => r.kind === "productions" && projectVisible(context, r)).map((r) => r.id),
  );
  const visibleConversations = new Set(
    rows
      .filter(
        (row) =>
          row.kind === "conversations" &&
          (row.data.mode === "team" ||
            listValue(row.data.participantIds).includes(context.user.id)),
      )
      .map((row) => row.id),
  );
  const conversations = new Map(
    rows.filter((row) => row.kind === "conversations").map((row) => [row.id, row]),
  );
  const grouped = Object.fromEntries(
    recordKinds.map((k) => [k, [] as DomainRecord[]]),
  ) as unknown as Record<RecordKind, DomainRecord[]>;
  const projectHours: Record<string, number> = {};
  for (const row of rows) {
    // A rolling release may add record kinds before every running build knows them.
    if (!Object.hasOwn(grouped, row.kind)) continue;
    if (row.kind === "shiftSwaps" && !canReadShiftSwap(context.user, row.data)) continue;
    if (row.kind === "conversations" && !visibleConversations.has(row.id)) continue;
    if (row.data.conversationId && !visibleConversations.has(String(row.data.conversationId)))
      continue;
    const pid = String(row.data.productionId || "");
    if (row.kind === "productions" && !visibleProjects.has(row.id)) continue;
    // The department calendar is shared independently of production membership.
    if (pid && row.kind !== "events" && !visibleProjects.has(pid)) continue;
    if (row.kind === "time" && pid)
      projectHours[pid] = (projectHours[pid] || 0) + Number(row.data.durationSeconds || 0);
    if (
      context.user.role === "user" &&
      ["time", "attendance", "timesheets", "leave"].includes(row.kind) &&
      row.data.userId !== context.user.id
    )
      continue;
    if (row.kind === "notifications" && row.data.userId !== context.user.id) continue;
    if (
      row.kind === "feedback" &&
      context.user.role !== "superadmin" &&
      row.data.userId !== context.user.id
    )
      continue;
    if (
      row.kind === "looks" &&
      row.data.status !== "published" &&
      row.createdBy !== context.user.id &&
      context.user.role === "user"
    )
      continue;
    if (row.kind === "messages") {
      if (chatArchive && !messageInChat(row, chatArchive)) continue;
      if (!chatArchive && grouped.messages.length >= workspaceMessageLimit)
        grouped.messages.shift();
    }
    if (row.kind !== "files")
      grouped[row.kind].push(
        row.kind === "leave" && row.data.userId !== context.user.id
          ? { ...row, data: { ...row.data, reason: "" } }
          : row,
      );
  }
  const readableIds = new Set(
    Object.values(grouped)
      .flat()
      .map((r) => r.id),
  );
  grouped.files = rows
    .filter(
      (r) =>
        r.kind === "files" &&
        readableIds.has(String(r.data.recordId)),
    )
    .map((r) => ({ ...r, data: { ...r.data, path: undefined } }));
  const personalTimers = await unstable_cache(
    () =>
      db
        .select({ id: timers.id, data: timers.data, kind: sql<string>`'time'` })
        .from(timers)
        .where(
          and(eq(timers.userId, context.user.id), eq(timers.departmentId, context.departmentId)),
        )
        .unionAll(
          db
            .select({
              id: attendanceTimers.id,
              data: attendanceTimers.data,
              kind: sql<string>`'attendance'`,
            })
            .from(attendanceTimers)
            .where(
              and(
                eq(attendanceTimers.userId, context.user.id),
                eq(attendanceTimers.departmentId, context.departmentId),
              ),
            ),
        ),
    ["personal-timers-v3", context.user.id],
    { revalidate: 3600, tags: [`timers:${context.user.id}`] },
  )();
  return {
    user: context.user,
    organization: { id: context.organizationId, name: context.organizationName },
    department: { id: context.departmentId, name: context.departmentName },
    members: members.map(({ workingTime, ...member }) => {
      const visible = visibleWorkingTime(
        workingTime,
        member.id,
        context.user.id,
        context.user.role,
      );
      return {
        ...member,
        status:
          context.user.role === "user" && member.status !== "active"
            ? ("disabled" as const)
            : member.status,
        ...(visible
          ? {
              preferences: {
                accentPalette: "green" as const,
                onboardingVersion: 0,
                workingTime: visible,
              },
            }
          : {}),
      };
    }),
    records: grouped,
    calendarProductions: rows
      .filter((row) => row.kind === "productions")
      .map(calendarProductionReference),
    productionOverview: rows
      .filter((row) => row.kind === "productions")
      .map(productionOverviewReference),
    timer: personalTimers.find((timer) => timer.kind === "time") || null,
    attendanceTimer: personalTimers.find((timer) => timer.kind === "attendance") || null,
    projectHours,
    ...(unreadChats
      ? {
          chatUnread: visibleChatUnread(unreadChats, {
            user: context.user,
            conversation: (id) =>
              visibleConversations.has(id) ? conversations.get(id) : undefined,
            production: (id) => visibleProjects.has(id),
          }),
        }
      : {}),
  };
}
