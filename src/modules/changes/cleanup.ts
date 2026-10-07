import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/platform/db";
import { outbox, recordOperations, records } from "@/platform/db/schema";
import { textValue, type RecordData } from "@/shared/contracts";

/** Reuses the existing outbox worker; no polling or new recurring job. */
export async function finalizeRecordDeletion(departmentId: string, payload: RecordData) {
  const operationId = textValue(payload.operationId);
  const recordId = textValue(payload.recordId);
  if (!operationId || !recordId) return;
  await db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(recordOperations)
      .where(
        and(
          eq(recordOperations.id, operationId),
          eq(recordOperations.departmentId, departmentId),
          eq(recordOperations.recordId, recordId),
        ),
      )
      .limit(1)
      .for("update");
    if (!operation || operation.undoneAt || operation.expiresAt > new Date()) return;
    const fileId = textValue(payload.fileId);
    if (!fileId) {
      const [parent] = await tx
        .select({ id: records.id })
        .from(records)
        .where(and(eq(records.id, recordId), eq(records.departmentId, departmentId)))
        .limit(1);
      if (parent) return;
      const [latest] = await tx
        .select({ id: recordOperations.id })
        .from(recordOperations)
        .where(
          and(
            eq(recordOperations.recordId, recordId),
            eq(recordOperations.departmentId, departmentId),
            eq(recordOperations.operation, "deleted"),
          ),
        )
        .orderBy(desc(recordOperations.createdAt), desc(recordOperations.id))
        .limit(1);
      if (latest?.id !== operationId) return;
    }
    const files = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, departmentId),
          eq(records.kind, "files"),
          sql`${records.data}->>'recordId'=${recordId}`,
          fileId ? eq(records.id, fileId) : undefined,
          fileId ? sql`${records.data}->>'pendingDeletionOperation'=${operationId}` : undefined,
        ),
      )
      .for("update");
    if (!files.length) return;
    await tx.delete(records).where(
      inArray(
        records.id,
        files.map((file) => file.id),
      ),
    );
    await tx.insert(outbox).values(
      files.map((file) => ({
        id: crypto.randomUUID(),
        departmentId,
        type: "FileDeletionRequestedV1",
        payload: {
          path: file.data.path,
          fileId: file.id,
          actorId: operation.userId,
          organizationId: operation.organizationId,
        },
      })),
    );
  });
}
