import { unstable_cache } from "next/cache";
import { and, eq, gte, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { scopeTag, type Context } from "@/platform/context";
import { textValue, type DomainRecord, type RecordData, type RecordKind } from "@/shared/contracts";
import { workspaceKindTag } from "@/shared/workspace-sync";
import { calendarCategoryKey } from "@/shared/calendar-categories";
import { isShowCategory } from "@/modules/calendar/show-events";
import {
  guestAccessWindow,
  guestCanRead,
  guestProductionIdsFrom,
  guestReadableKinds,
} from "./guest-rules";

/**
 * Productions the caller may read as a guest because they work one of its performances or
 * rehearsals soon. One indexed query per user and theatre day; any calendar change refreshes it.
 * Admins already read every production, so only team members are looked up.
 */
export async function readGuestProductionIds(context: Context): Promise<string[]> {
  if (context.user.role !== "user") return [];
  const { day, from, to } = guestAccessWindow();
  return unstable_cache(
    async () => {
      const rows = await db
        .select({ id: records.id, kind: records.kind, data: records.data })
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            or(
              eq(records.kind, "calendarCategories"),
              and(
                eq(records.kind, "events"),
                isNotNull(records.productionId),
                ne(records.productionId, ""),
                sql`${records.data}->'participantIds' @> ${JSON.stringify([context.user.id])}::jsonb`,
                lte(records.startAt, to),
                or(
                  gte(records.endAt, from),
                  sql`coalesce(${records.data}->>'recurrence', 'none') <> 'none'`,
                ),
              ),
            ),
          ),
        )
        .orderBy(records.createdAt);
      const typed = rows.map((row) => ({ ...row, data: row.data ?? {} }) as DomainRecord);
      return guestProductionIdsFrom(
        typed.filter((row) => row.kind === "events"),
        typed.filter((row) => row.kind === "calendarCategories"),
        context.user.id,
      );
    },
    ["guest-productions-v1", context.departmentId, context.user.id, day],
    {
      revalidate: 3600,
      tags: [
        scopeTag(context.departmentId),
        workspaceKindTag(context.departmentId, "events"),
        workspaceKindTag(context.departmentId, "calendarCategories"),
      ],
    },
  )();
}

/** Read endpoints only (file download, history): never used for a write or delete check. */
export async function guestMayRead(context: Context, row: { kind: RecordKind; data: RecordData }) {
  if (
    context.user.role !== "user" ||
    !guestReadableKinds.has(row.kind) ||
    !textValue(row.data.productionId)
  )
    return false;
  return guestCanRead(row.kind, row.data.productionId, await readGuestProductionIds(context));
}

/** Performances and rehearsals may be covered by colleagues outside the production team. */
export async function showEventAllowsGuests(
  context: Context,
  data: RecordData,
  tx: Transaction | typeof db = db,
) {
  const key = calendarCategoryKey(textValue(data.category));
  if (!key) return false;
  const [category] = await tx
    .select({ data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "calendarCategories"),
        sql`${records.data}->>'key' = ${key}`,
      ),
    )
    .limit(1);
  return isShowCategory(key, category?.data);
}
