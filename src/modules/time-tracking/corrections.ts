import { and, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { auditChange } from "@/platform/events";
import type { RecordData } from "@/shared/contracts";
import { bookingWeeks } from "./rules";

/** Runs in the booking transaction while holding the owner's time lock. */
export async function reopenCorrectedWeeks(
  context: Context,
  tx: Transaction,
  before?: RecordData,
  after?: RecordData,
) {
  const fields = [
    "title",
    "date",
    "start",
    "end",
    "durationSeconds",
    "pauseSeconds",
    "productionId",
    "taskId",
    "category",
  ];
  if (before && after && fields.every((key) => before[key] === after[key])) return;
  const owner = String(after?.userId || before?.userId);
  const weeks = [...new Set([...bookingWeeks(before), ...bookingWeeks(after)])];
  if (!weeks.length) return;
  const changed = await tx
    .update(records)
    .set({
      data: sql`jsonb_set(jsonb_set(${records.data}, '{status}', '"changes_requested"'::jsonb), '{note}', to_jsonb(concat_ws(E'\n\n', nullif(${records.data}->>'note', ''), 'Zeitbuchungen wurden korrigiert. Bitte die Woche erneut einreichen und prüfen.')))`,
      version: sql`${records.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "timesheets"),
        eq(records.ownerId, owner),
        inArray(sql<string>`${records.data}->>'week'`, weeks),
        inArray(sql<string>`${records.data}->>'status'`, ["approved", "submitted"]),
      ),
    )
    .returning({ id: records.id });
  for (const sheet of changed)
    await auditChange(tx, context, "timesheet.reopened_after_correction", sheet.id);
}
