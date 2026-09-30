import { and, eq, ne, lt, gt, sql } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";
import type { RecordData } from "@/shared/contracts";
import { durationSeconds, localDay, splitAcrossDays, startOfLocalDay } from "./rules";
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
          lt(records.startAt, new Date(String(data.end))),
          gt(records.endAt, new Date(String(data.start))),
        ),
      )
      .limit(1);
    if (overlap.length)
      throw new HttpError(409, "Diese Zeit überschneidet sich mit einer vorhandenen Buchung.");
  }
  if (kind === "attendance") return;
  const days = Array.isArray(data.dayAllocations)
    ? data.dayAllocations.map((x: unknown) => String((x as { date: string }).date))
    : [String(data.date)];
  const approved = await tx
    .select({ data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "timesheets"),
        eq(records.ownerId, owner),
        sql`${records.data}->>'status'='approved'`,
      ),
    );
  for (const sheet of approved) {
    const begin = startOfLocalDay(String(sheet.data.week));
    const end = startOfLocalDay(
      format(addDays(parseISO(String(sheet.data.week)), 7), "yyyy-MM-dd"),
    );
    if (days.some((d) => startOfLocalDay(d) >= begin && startOfLocalDay(d) < end))
      throw new HttpError(
        409,
        "Diese Woche ist freigegeben. Bitte fordere eine Korrektur bei einem Admin an.",
      );
  }
}
