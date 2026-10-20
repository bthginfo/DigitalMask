import { unstable_cache, revalidateTag } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { serialize, projectVisible } from "./repository";
import { scheduleLiveChange } from "@/platform/realtime";
import { canReadShiftSwap } from "@/modules/shift-swaps/rules";
import { visibleWorkingTime } from "@/shared/working-time";
import { calendarProductionReference } from "@/shared/calendar-access";
import { productionOverviewReference } from "@/shared/production-overview";
import { workspaceGroups, workspaceKindTag, notificationUserTag } from "@/shared/workspace-sync";
export function invalidateWorkspace(
  departmentId: string,
  broadcast = true,
  kinds?: readonly RecordKind[],
) {
  const tags = kinds?.map((kind) => workspaceKindTag(departmentId, kind)) ?? [
    scopeTag(departmentId),
  ];
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
  if (broadcast) scheduleLiveChange(departmentId, kinds);
}
export function invalidateNotifications(departmentId: string, userIds: readonly string[]) {
  for (const userId of new Set(userIds))
    revalidateTag(notificationUserTag(departmentId, userId), { expire: 0 });
  if (userIds.length) scheduleLiveChange(departmentId, ["notifications"]);
}
export function invalidateTeam(departmentId: string) {
  revalidateTag(`team:${departmentId}`, { expire: 0 });
}
export function invalidateTimer(userId: string) {
  revalidateTag(`timers:${userId}`, { expire: 0 });
}
async function readScope(departmentId: string, kinds: readonly RecordKind[]) {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.departmentId, departmentId), inArray(records.kind, [...kinds])))
    .orderBy(records.createdAt);
  return rows.map(serialize);
}
async function readWorkspaceRows(context: Context, selected?: readonly RecordKind[]) {
  const wanted = selected
    ? new Set<RecordKind>([...selected, "productions", "conversations"])
    : null;
  const groups = Object.entries(workspaceGroups).filter(
    ([, kinds]) => !wanted || kinds.some((kind) => wanted.has(kind)),
  );
  const snapshots = await Promise.all(
    groups.map(([group, kinds]) =>
      unstable_cache(
        () => readScope(context.departmentId, kinds),
        ["department-group-v7", context.departmentId, group],
        {
          revalidate: 3600,
          tags: [
            scopeTag(context.departmentId),
            ...kinds.map((kind) => workspaceKindTag(context.departmentId, kind)),
          ],
        },
      )(),
    ),
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
                    eq(records.kind, "notifications"),
                    eq(records.ownerId, context.user.id),
                    sql`${records.data}->>'userId' = ${context.user.id}`,
                    sql`coalesce(${records.data}->>'read','false') <> 'true'`,
                  ),
                )
                .orderBy(records.createdAt)
            ).map(serialize),
          ["personal-unread-v1", context.departmentId, context.user.id],
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
): Promise<Workspace> {
  const [rows, members] = await Promise.all([
    readWorkspaceRows(context, selected),
    readTeam(context.departmentId),
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
    if (row.kind === "messages" && grouped.messages.length >= 300) grouped.messages.shift();
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
        !r.data.pendingDeletionOperation &&
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
  };
}
