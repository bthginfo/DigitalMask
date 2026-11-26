import { and, eq, ne, lt, gt, sql } from "drizzle-orm";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";
import type { RecordData } from "@/shared/contracts";
import { durationSeconds, localDay, splitAcrossDays } from "./rules";
/** durationSeconds caps work at 7 days; pauseSeconds is at most 1 day. */
export const maxBookingSpanMs = 8 * 86_400_000;
export async function validateBooking(
  context: Context,
  kind: "time" | "attendance",
  data: RecordData,
  tx: Transaction,
  recordId?: string,
) {
  const owner = String(data.userId);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":" + kind + ":" + owner}))`,
  );
  if (Boolean(data.start) !== Boolean(data.end))
    throw new HttpError(400, "Beginn und Ende müssen gemeinsam angegeben werden.");
  if (data.start && data.end) {
    try {
      data.durationSeconds = durationSeconds(
        String(data.start),
        String(data.end),
        Number(data.pauseSeconds),
      );
      data.date = localDay(String(data.start));
      data.dayAllocations = splitAcrossDays(
        String(data.start),
        String(data.end),
        Number(data.pauseSeconds),
      );
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Bitte prüfe die Dauer.");
    }
    const overlap = await tx
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, kind),
          eq(records.ownerId, owner),
          recordId ? ne(records.id, recordId) : undefined,
          // Bookings last at most 7 days plus at most 1 day of pauses: bounded index range.
          gt(records.startAt, new Date(Date.parse(String(data.start)) - maxBookingSpanMs)),
          lt(records.startAt, new Date(String(data.end))),
          gt(records.endAt, new Date(String(data.start))),
        ),
      )
      .limit(1);
    if (overlap.length)
      throw new HttpError(409, "Diese Zeit überschneidet sich mit einer vorhandenen Buchung.");
  }
}
