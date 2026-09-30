import { and, eq, ne, sql } from "drizzle-orm";
import { records } from "@/platform/db/schema";
import type { Transaction } from "@/platform/db";
import type { Context } from "@/platform/context";
import type { RecordData } from "@/shared/contracts";
import { HttpError } from "@/platform/http";
import { localDay, startOfLocalDay } from "@/modules/time-tracking/rules";

export async function validateCalendarCategory(
  context: Context,
  data: RecordData,
  tx: Transaction,
  existing?: typeof records.$inferSelect,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":calendar"}))`,
  );
  if (existing && existing.data.key !== data.key)
    throw new HttpError(400, "Der Kategoriencode kann nicht geändert werden.");
  const [duplicate] = await tx
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "calendarCategories"),
        sql`${records.data}->>'key'=${String(data.key)}`,
        existing ? ne(records.id, existing.id) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new HttpError(409, "Dieser Kategoriencode ist bereits vergeben.");
  const oldBlocking =
    typeof existing?.data.blocksTime === "boolean"
      ? existing.data.blocksTime
      : existing?.data.key !== "half-day-off";
  const newBlocking =
    typeof data.blocksTime === "boolean" ? data.blocksTime : data.key !== "half-day-off";
  if (existing && (existing.data.allDay !== data.allDay || oldBlocking !== newBlocking))
    await assertUnusedCategory(context, String(data.key), tx);
}

export async function assertUnusedCategory(context: Context, key: string, tx: Transaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":calendar"}))`,
  );
  const [used] = await tx
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "events"),
        sql`${records.data}->>'category'=${key}`,
      ),
    )
    .limit(1);
  if (used)
    throw new HttpError(
      409,
      "Diese Kategorie wird verwendet. Ordne die Termine zuerst einer anderen Kategorie zu.",
    );
}

export async function normalizeEventCategory(context: Context, data: RecordData, tx: Transaction) {
  const [category] = await tx
    .select({ data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "calendarCategories"),
        sql`${records.data}->>'key'=${String(data.category)}`,
      ),
    )
    .limit(1);
  if (!category) throw new HttpError(400, "Bitte wähle eine vorhandene Kalenderkategorie.");
  data.allDay = category.data.allDay === true;
  if (data.allDay) {
    data.start = startOfLocalDay(localDay(String(data.start))).toISOString();
    data.end = startOfLocalDay(localDay(String(data.end))).toISOString();
  }
  return String(category.data.name);
}
