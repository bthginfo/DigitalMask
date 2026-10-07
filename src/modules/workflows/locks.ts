import { sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import type { Context } from "@/platform/context";
import type { RecordKind } from "@/shared/contracts";

/** Always acquire the shared planning lock before loading/locking record rows. */
export async function acquireWorkflowLock(context: Context, kind: RecordKind, tx: Transaction) {
  const group = ["materials", "reservations"].includes(kind)
    ? "inventory"
    : ["events", "shiftSwaps", "calendarCategories"].includes(kind)
      ? "calendar"
      : undefined;
  if (group)
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":" + group}))`,
    );
}
