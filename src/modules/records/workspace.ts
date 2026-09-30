import { unstable_cache, revalidateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { records, memberships, user, timers } from "@/platform/db/schema";
import { scopeTag, type Context } from "@/platform/context";
import {
  recordKinds,
  type DomainRecord,
  type Workspace,
  type RecordKind,
} from "@/shared/contracts";
import { serialize, projectVisible } from "./repository";
export function invalidateWorkspace(departmentId: string) {
  revalidateTag(scopeTag(departmentId), { expire: 0 });
}
async function readScope(departmentId: string) {
  const [rows, members] = await Promise.all([
    db
      .select()
      .from(records)
      .where(eq(records.departmentId, departmentId))
      .orderBy(records.createdAt),
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
  ]);
  return {
    rows: rows.map(serialize),
    members: members.map((m) => ({ ...m, username: m.username || "" })),
  };
}
export async function getWorkspace(context: Context): Promise<Workspace> {
  const { rows, members } = await unstable_cache(
    () => readScope(context.departmentId),
    ["department-data", context.departmentId],
    { revalidate: 300, tags: [scopeTag(context.departmentId)] },
  )();
  const visibleProjects = new Set(
    rows.filter((r) => r.kind === "productions" && projectVisible(context, r)).map((r) => r.id),
  );
  const grouped = Object.fromEntries(
    recordKinds.map((k) => [k, [] as DomainRecord[]]),
  ) as unknown as Record<RecordKind, DomainRecord[]>;
  const projectHours: Record<string, number> = {};
  for (const row of rows) {
    // A rolling release may add record kinds before every running build knows them.
    if (!Object.hasOwn(grouped, row.kind)) continue;
    const pid = String(row.data.productionId || "");
    if (row.kind === "productions" && !visibleProjects.has(row.id)) continue;
    if (pid && !visibleProjects.has(pid)) continue;
    if (row.kind === "time" && pid)
      projectHours[pid] = (projectHours[pid] || 0) + Number(row.data.durationSeconds || 0);
    if (
      context.user.role === "user" &&
      ["time", "timesheets", "leave"].includes(row.kind) &&
      row.data.userId !== context.user.id
    )
      continue;
    if (row.kind === "notifications" && row.data.userId !== context.user.id) continue;
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
    .filter((r) => r.kind === "files" && readableIds.has(String(r.data.recordId)))
    .map((r) => ({ ...r, data: { ...r.data, path: undefined } }));
  const [timer] = await unstable_cache(
    () =>
      db
        .select({ id: timers.id, data: timers.data })
        .from(timers)
        .where(
          and(eq(timers.userId, context.user.id), eq(timers.departmentId, context.departmentId)),
        )
        .limit(1),
    ["timer", context.user.id],
    { revalidate: 300, tags: [scopeTag(context.departmentId)] },
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
    timer: timer || null,
    projectHours,
  };
}
