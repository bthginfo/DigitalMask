import { unstable_cache, revalidateTag } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { records, memberships, user, timers, attendanceTimers } from "@/platform/db/schema";
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
export function invalidateWorkspace(departmentId: string, broadcast = true) {
  revalidateTag(scopeTag(departmentId), { expire: 0 });
  if (broadcast) scheduleLiveChange(departmentId);
}
export function invalidateTeam(departmentId: string) {
  revalidateTag(`team:${departmentId}`, { expire: 0 });
}
export function invalidateTimer(userId: string) {
  revalidateTag(`timers:${userId}`, { expire: 0 });
}
async function readScope(departmentId: string) {
  const rows = await db
    .select()
    .from(records)
    .where(eq(records.departmentId, departmentId))
    .orderBy(records.createdAt);
  return rows.map(serialize);
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
        })
        .from(memberships)
        .innerJoin(user, eq(memberships.userId, user.id))
        .where(eq(memberships.departmentId, departmentId)),
    ["department-team-v3", departmentId],
    { revalidate: 3600, tags: [`team:${departmentId}`] },
  )();
  return members.map((m) => ({ ...m, username: m.username || "" }));
}
export async function getWorkspace(context: Context): Promise<Workspace> {
  const [rows, members] = await Promise.all([
    unstable_cache(
      () => readScope(context.departmentId),
      ["department-data-v4", context.departmentId],
      { revalidate: 300, tags: [scopeTag(context.departmentId)] },
    )(),
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
    if (pid && !visibleProjects.has(pid)) continue;
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
    members: members.map((m) =>
      context.user.role === "user"
        ? { ...m, status: m.status === "active" ? "active" : "disabled" }
        : m,
    ),
    records: grouped,
    timer: personalTimers.find((timer) => timer.kind === "time") || null,
    attendanceTimer: personalTimers.find((timer) => timer.kind === "attendance") || null,
    projectHours,
  };
}
