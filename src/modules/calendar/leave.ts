import { and, eq, sql } from "drizzle-orm";
import { addDays, parseISO, format } from "date-fns";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { requireAdmin, type Context } from "@/platform/context";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { emit, auditChange, scheduleEvents } from "@/platform/events";
import { HttpError } from "@/platform/http";
import { startOfLocalDay } from "@/modules/time-tracking/rules";
import { occurrences } from "./occurrences";
export async function decideLeave(context: Context, id: string, status: unknown) {
  requireAdmin(context);
  if (status !== "approved" && status !== "rejected")
    throw new HttpError(400, "Ungültige Entscheidung.");
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":calendar"}))`,
    );
    const row = await findRecord(context, id, "leave", tx);
    if (row.data.status === "withdrawn")
      throw new HttpError(409, "Dieser Antrag wurde zurückgezogen.");
    let eventId = String(row.data.eventId || "");
    if (status === "approved") {
      const start = startOfLocalDay(String(row.data.start));
      const next = addDays(parseISO(String(row.data.end)), 1);
      const end = startOfLocalDay(format(next, "yyyy-MM-dd"));
      const events = await tx
        .select()
        .from(records)
        .where(and(eq(records.departmentId, context.departmentId), eq(records.kind, "events")));
      for (const event of events) {
        if (
          event.id === eventId ||
          !Array.isArray(event.data.participantIds) ||
          !event.data.participantIds.includes(row.data.userId)
        )
          continue;
        if (occurrences(serialize(event), start, end).some((o) => o.start < end && o.end > start))
          throw new HttpError(
            409,
            `Der Freiwunsch überschneidet sich mit „${event.data.title}“. Bitte passe zuerst den Dienst an.`,
          );
      }
      eventId = eventId || crypto.randomUUID();
      await tx
        .insert(records)
        .values({
          id: eventId,
          kind: "events",
          organizationId: context.organizationId,
          departmentId: context.departmentId,
          createdBy: context.user.id,
          startAt: start,
          endAt: end,
          data: {
            title: "Frei",
            start: start.toISOString(),
            end: end.toISOString(),
            category: "absence",
            allDay: true,
            productionId: "",
            participantIds: [row.data.userId],
            location: "",
            recurrence: "none",
            until: "",
            exceptions: [],
            leaveId: id,
          },
        })
        .onConflictDoUpdate({
          target: records.id,
          set: { startAt: start, endAt: end, updatedAt: new Date() },
        });
    } else if (eventId) {
      await tx
        .delete(records)
        .where(and(eq(records.id, eventId), eq(records.departmentId, context.departmentId)));
      eventId = "";
    }
    const [updated] = await tx
      .update(records)
      .set({
        data: { ...row.data, status, eventId },
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(records.id, id))
      .returning();
    await emit(tx, context, "LeaveRequestDecidedV1", {
      userIds: [row.data.userId],
      title: status === "approved" ? "Freiwunsch genehmigt" : "Freiwunsch abgelehnt",
      body: `${row.data.start} bis ${row.data.end}`,
      link: "/?module=calendar",
    });
    await auditChange(tx, context, "leave.decided", id);
    return serialize(updated);
  });
  invalidateWorkspace(context.departmentId);
  scheduleEvents();
  return result;
}
