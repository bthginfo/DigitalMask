import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { listValue } from "@/shared/contracts";
import { localDay } from "@/modules/time-tracking/rules";

type Row = typeof records.$inferSelect;
const margin = 86_400_000;

/**
 * Events whose occurrences can intersect [from, to): single events ending after `from` and
 * starting before `to`, plus daily/weekly series that start before `to` and have not ended
 * before `from`. A one-day margin on both sides keeps all-day and time-zone edges included.
 * Served by `record_event_end_idx` and `record_event_series_idx`.
 */
export function eventWindowCondition(from: Date, to: Date) {
  const lower = new Date(from.getTime() - margin);
  const upper = new Date(to.getTime() + margin);
  return and(
    eq(records.kind, "events"),
    lt(records.startAt, upper),
    or(
      gt(records.endAt, lower),
      and(
        sql`${records.data}->>'recurrence' in ('daily','weekly')`,
        sql`(coalesce(${records.data}->>'until','') = '' or ${records.data}->>'until' >= ${localDay(lower)})`,
      ),
    ),
  );
}

/** Only events with at least one of these participants. */
export function participantCondition(participantIds: readonly string[]) {
  const ids = [...new Set(participantIds)];
  if (!ids.length) return sql`false`;
  return sql`${records.data}->'participantIds' ?| array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The calendar rows a conflict check needs, instead of every event of the department:
 * events in the window (optionally for some participants), all calendar categories, and the
 * productions those events refer to (for conflict titles).
 */
export async function calendarWindow(
  tx: Transaction,
  departmentId: string,
  from: Date,
  to: Date,
  options: { excludeIds?: readonly string[]; participantIds?: readonly string[] } = {},
) {
  const excluded = [...new Set(options.excludeIds || [])].filter(Boolean);
  const events = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, departmentId),
        eventWindowCondition(from, to),
        options.participantIds ? participantCondition(options.participantIds) : undefined,
        ...excluded.map((id) => ne(records.id, id)),
      ),
    );
  const categories = await calendarCategoryRows(tx, departmentId);
  const productionIds = [
    ...new Set(events.map((event) => String(event.data.productionId || "")).filter(Boolean)),
  ];
  const productions = await productionRows(tx, departmentId, productionIds);
  return { events, categories, productions };
}

export function calendarCategoryRows(tx: Transaction, departmentId: string) {
  return tx
    .select()
    .from(records)
    .where(and(eq(records.departmentId, departmentId), eq(records.kind, "calendarCategories")));
}

export async function productionRows(
  tx: Transaction,
  departmentId: string,
  ids: readonly string[],
): Promise<Row[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  return tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, departmentId),
        eq(records.kind, "productions"),
        inArray(records.id, unique),
      ),
    );
}

export const participantsOf = (row: Pick<Row, "data">) => listValue(row.data.participantIds);
