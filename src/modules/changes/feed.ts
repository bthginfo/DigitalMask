import { unstable_cache } from "next/cache";
import { desc, eq, and, gte, notInArray } from "drizzle-orm";
import { db } from "@/platform/db";
import { recordOperations } from "@/platform/db/schema";
import { scopeTag, type Context } from "@/platform/context";
import { getWorkspace } from "@/modules/records/workspace";
import { changedFields, changeTitle, visibleChange } from "./model";
import type { ChangeFeed } from "./contracts";

export async function getChanges(context: Context, recordId?: string): Promise<ChangeFeed> {
  const [workspace, operations] = await Promise.all([
    getWorkspace(context),
    unstable_cache(
      () =>
        db
          .select({
            id: recordOperations.id,
            kind: recordOperations.kind,
            recordId: recordOperations.recordId,
            operation: recordOperations.operation,
            userId: recordOperations.userId,
            before: recordOperations.before,
            after: recordOperations.after,
            createdAt: recordOperations.createdAt,
          })
          .from(recordOperations)
          .where(
            and(
              eq(recordOperations.departmentId, context.departmentId),
              recordId ? eq(recordOperations.recordId, recordId) : undefined,
              notInArray(recordOperations.kind, [
                "files",
                "messages",
                "notifications",
                "feedback",
                "conversations",
                "timesheets",
              ]),
              gte(recordOperations.createdAt, new Date(Date.now() - 30 * 86400_000)),
            ),
          )
          .orderBy(desc(recordOperations.createdAt), desc(recordOperations.id))
          .limit(100),
      ["record-changes-v2", context.departmentId, recordId || "all"],
      { revalidate: 300, tags: [scopeTag(context.departmentId)] },
    )(),
  ]);
  const changes = operations.flatMap((entry) => {
    const record = entry.after || entry.before;
    if (!record || (recordId && entry.recordId !== recordId) || !visibleChange(record, workspace))
      return [];
    return [
      {
        id: entry.id,
        recordId: entry.recordId,
        kind: entry.kind,
        operation: entry.operation,
        userId: entry.userId,
        createdAt: entry.createdAt.toISOString(),
        title: changeTitle(record),
        productionId: typeof record.data.productionId === "string" ? record.data.productionId : "",
        version: entry.after?.version || record.version,
        fields: changedFields(entry.before?.data, entry.after?.data).filter(
          (field) =>
            !(
              record.kind === "leave" &&
              record.data.userId !== context.user.id &&
              field.key === "reason"
            ),
        ),
      },
    ];
  });
  return {
    changes,
    cursor: changes.reduce(
      (latest, entry) => (entry.createdAt > latest ? entry.createdAt : latest),
      "",
    ),
  };
}
