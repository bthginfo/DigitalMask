import { and, eq, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { requireAdmin, type Context } from "@/platform/context";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { auditChange } from "@/platform/events";
import { HttpError } from "@/platform/http";
import type { RecordData } from "@/shared/contracts";
export async function timesheetAction(
  context: Context,
  action: string,
  id: string | undefined,
  data: RecordData,
) {
  const result = await db.transaction(async (tx) => {
    if (action === "timesheet-submit") {
      const week = String(data.week || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(`${week}T12:00:00Z`).getUTCDay() !== 1)
        throw new HttpError(400, "Bitte wähle einen Wochenbeginn am Montag.");
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":time:" + context.user.id}))`,
      );
      const [existing] = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "timesheets"),
            eq(records.ownerId, context.user.id),
            sql`${records.data}->>'week'=${week}`,
          ),
        )
        .limit(1);
      if (existing?.data.status === "approved")
        throw new HttpError(409, "Diese Woche wurde bereits freigegeben.");
      const payload = { userId: context.user.id, week, status: "submitted", note: "" };
      let row;
      if (existing) {
        [row] = await tx
          .update(records)
          .set({ data: payload, version: existing.version + 1, updatedAt: new Date() })
          .where(eq(records.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(records)
          .values({
            id: crypto.randomUUID(),
            kind: "timesheets",
            organizationId: context.organizationId,
            departmentId: context.departmentId,
            createdBy: context.user.id,
            ownerId: context.user.id,
            data: payload,
          })
          .returning();
      }
      await auditChange(tx, context, "timesheet.submitted", row.id);
      return serialize(row);
    }
    requireAdmin(context);
    if (!id) throw new HttpError(400, "Bitte wähle einen Stundenzettel.");
    if (data.status !== "approved" && data.status !== "changes_requested")
      throw new HttpError(400, "Ungültige Entscheidung.");
    let row = await findRecord(context, id, "timesheets", tx);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":time:" + String(row.data.userId)}))`,
    );
    row = await findRecord(context, id, "timesheets", tx, true);
    if (data.version !== undefined && data.version !== row.version)
      throw new HttpError(
        409,
        "Die Woche wurde inzwischen geändert. Bitte prüfe die aktuellen Zeiten.",
      );
    const [updated] = await tx
      .update(records)
      .set({
        data: { ...row.data, status: data.status, note: String(data.note || "").slice(0, 20000) },
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(records.id, id))
      .returning();
    await auditChange(tx, context, "timesheet.decided", id);
    return serialize(updated);
  });
  invalidateWorkspace(context.departmentId);
  return result;
}
