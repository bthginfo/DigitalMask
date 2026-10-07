import { and, eq, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { records, recordOperations, recordHistory } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { saveRecord, deleteRecord, assertWrite } from "@/modules/records/service";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { acquireWorkflowLock } from "@/modules/workflows/locks";
import { scheduleEvents, auditChange } from "@/platform/events";
import type { DomainRecord } from "@/shared/contracts";
import { assertUndoState } from "./model";
import { captureRecordOperation } from "./operations";
import { restoreRow } from "./snapshots";

export async function undoOperation(context: Context, operationId: string) {
  await db.transaction(async (tx) => {
    // Ownership is included in the query so guessed receipts never expose other people's work.
    const [operation] = await tx
      .select()
      .from(recordOperations)
      .where(
        and(
          eq(recordOperations.id, operationId),
          eq(recordOperations.departmentId, context.departmentId),
          eq(recordOperations.organizationId, context.organizationId),
          eq(recordOperations.userId, context.user.id),
        ),
      )
      .limit(1)
      .for("update");
    if (!operation || operation.undoPayload === null)
      throw new HttpError(409, "Dieser Schritt kann nicht mehr rückgängig gemacht werden.");
    await acquireWorkflowLock(context, operation.kind, tx);
    if (["productions", "people"].includes(operation.kind))
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`people:${context.departmentId}`}))`,
      );
    const [current] = await tx
      .select()
      .from(records)
      .where(
        and(eq(records.id, operation.recordId), eq(records.departmentId, context.departmentId)),
      )
      .limit(1)
      .for("update");
    const failure = assertUndoState(
      operation,
      context.user.id,
      context.departmentId,
      context.organizationId,
      current ? serialize(current) : undefined,
    );
    if (failure) throw new HttpError(409, failure);
    assertWrite(
      context,
      operation.kind,
      current || (operation.before ? restoreRow(operation.before) : undefined),
    );
    let restored: typeof records.$inferSelect | undefined;
    if (!operation.before) {
      if (!current) throw new HttpError(409, "Der Eintrag wurde inzwischen entfernt.");
      await deleteRecord(context, operation.kind, current.id, {
        transaction: tx,
        skipCapture: true,
        version: current.version,
      });
    } else {
      if (operation.undoPayload.removedFile) {
        const original = restoreRow(operation.undoPayload.removedFile as DomainRecord);
        const pending = await findRecord(context, original.id, "files", tx, true);
        if (
          pending.data.pendingDeletionOperation !== operation.id ||
          pending.version !== original.version + 1
        )
          throw new HttpError(
            409,
            "Die Datei wurde inzwischen geändert. Bitte öffne den Eintrag neu.",
          );
        // The file row and collaborative document stayed intact throughout the undo window.
        await tx
          .update(records)
          .set({ data: original.data, version: pending.version + 1, updatedAt: new Date() })
          .where(eq(records.id, pending.id));
      }
      let version = current?.version;
      if (!current) {
        const [placeholder] = await tx
          .insert(records)
          .values(restoreRow(operation.before))
          .onConflictDoNothing()
          .returning();
        if (!placeholder) throw new HttpError(409, "Der Eintrag ist inzwischen wieder vorhanden.");
        version = placeholder.version;
      }
      const result = await saveRecord(
        context,
        operation.kind,
        operation.before.data,
        operation.recordId,
        version,
        {
          transaction: tx,
          skipCapture: true,
          undo: true,
          replaceData: true,
        },
      );
      restored = restoreRow(result);
      const history = operation.undoPayload.history as
        | (Omit<typeof recordHistory.$inferSelect, "createdAt"> & { createdAt: string })[]
        | undefined;
      if (history?.length)
        await tx
          .insert(recordHistory)
          .values(
            history.map((entry) => ({
              ...entry,
              createdAt: new Date(entry.createdAt),
            })),
          )
          .onConflictDoNothing();
    }
    await tx
      .update(recordOperations)
      .set({ undoneAt: new Date(), undoPayload: null })
      .where(eq(recordOperations.id, operation.id));
    await captureRecordOperation(tx, context, current, restored, {
      operation: "undone",
      undoable: false,
    });
    await auditChange(tx, context, `${operation.kind}.undone`, operation.recordId);
  });
  invalidateWorkspace(context.departmentId);
  scheduleEvents();
  return { ok: true };
}
