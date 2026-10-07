import { and, lt, isNotNull, sql } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { recordOperations, records, outbox } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import type { RecordData } from "@/shared/contracts";
import { serialize } from "@/modules/records/repository";
import { changeTitle } from "./model";
import type { ChangeSummary, UndoReceipt } from "./contracts";

export const undoWindowMs = 120_000;
export async function captureRecordOperation(
  tx: Transaction,
  context: Context,
  before?: typeof records.$inferSelect,
  after?: typeof records.$inferSelect,
  options: {
    operation?: ChangeSummary["operation"];
    undoable?: boolean;
    payload?: RecordData;
  } = {},
): Promise<UndoReceipt | undefined> {
  const record = after || before;
  if (!record) return;
  const undoable = options.undoable !== false;
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + (undoable ? undoWindowMs : 0));
  await tx.insert(recordOperations).values({
    id,
    departmentId: context.departmentId,
    organizationId: context.organizationId,
    userId: context.user.id,
    recordId: record.id,
    kind: record.kind,
    operation: options.operation || (before ? (after ? "updated" : "deleted") : "created"),
    before: before ? serialize(before) : null,
    after: after ? serialize(after) : null,
    undoPayload: undoable ? options.payload || {} : null,
    expiresAt,
  });
  return undoable
    ? { id, label: changeTitle(record), expiresAt: expiresAt.toISOString() }
    : undefined;
}

/** Runs only in the existing daily maintenance task, never on a visit or clock tick. */
export async function pruneRecordOperations() {
  const now = new Date();
  await db
    .update(recordOperations)
    .set({ undoPayload: null })
    .where(and(lt(recordOperations.expiresAt, now), isNotNull(recordOperations.undoPayload)));
  await db
    .delete(recordOperations)
    .where(
      and(
        lt(recordOperations.createdAt, new Date(now.getTime() - 30 * 86400_000)),
        sql`not exists (select 1 from ${outbox} where ${outbox.type}='RecordDeletionFinalizedV1' and ${outbox.payload}->>'operationId'=${recordOperations.id} and ${outbox.status}<>'done')`,
      ),
    );
}
