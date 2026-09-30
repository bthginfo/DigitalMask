import { and, eq, ne, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { records, timers } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { textValue, type RecordData } from "@/shared/contracts";
import type { CategoryScope } from "@/shared/domain-categories";
import { documentSections } from "@/shared/document-sections";

async function lock(context: Context, scope: string, tx: Transaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":categories:" + scope}))`,
  );
}
export async function validateDomainCategory(
  context: Context,
  data: RecordData,
  tx: Transaction,
  existing?: typeof records.$inferSelect,
) {
  await lock(context, String(data.scope), tx);
  if (existing && (existing.data.key !== data.key || existing.data.scope !== data.scope))
    throw new HttpError(400, "Bereich und Kategoriencode können nicht geändert werden.");
  const [duplicate] = await tx
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "categories"),
        sql`${records.data}->>'scope'=${String(data.scope)} and ${records.data}->>'key'=${String(data.key)}`,
        existing ? ne(records.id, existing.id) : undefined,
      ),
    )
    .limit(1);
  if (duplicate) throw new HttpError(409, "Dieser Kategoriencode ist im Bereich bereits vergeben.");
}
export async function assertUnusedDomainCategory(
  context: Context,
  scope: string,
  key: string,
  tx: Transaction,
) {
  await lock(context, scope, tx);
  const [used] = await tx
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        scope === "time" || scope === "materials"
          ? sql`${records.kind}=${scope} and ${records.data}->>'category'=${key}`
          : sql`(${records.kind}=${scope} or (${records.kind}='templates' and ${scope}='looks')) and (
        ${records.data}->'sections' @> ${JSON.stringify([{ key }])}::jsonb or
        (${records.data}->'sections' is null and (
          (${scope}='handovers' and ${key}='notes' and coalesce(${records.data}->>'notes','')<>'') or
          (${scope}='looks' and (
            (${key}='preparation' and (coalesce(${records.data}->>'preparation','')<>'' or coalesce(${records.data}->>'materials','')<>'')) or
            (${key}='makeup' and coalesce(${records.data}->>'steps','')<>'') or
            (${key}='changeover' and coalesce(${records.data}->>'changeover','')<>'') or
            (${key}='setup' and coalesce(${records.data}->'templateFields','{}'::jsonb)<>'{}'::jsonb)
          ))
        ))
      )`,
      ),
    )
    .limit(1);
  const [activeTimer] =
    scope === "time"
      ? await tx
          .select({ id: timers.id })
          .from(timers)
          .where(
            and(
              eq(timers.departmentId, context.departmentId),
              sql`${timers.data}->>'category'=${key}`,
            ),
          )
          .limit(1)
      : [];
  if (used || activeTimer)
    throw new HttpError(
      409,
      "Diese Kategorie wird noch verwendet. Entferne zuerst die Zuordnungen.",
    );
}

export async function validateCategoryReferences(
  context: Context,
  kind: string,
  data: RecordData,
  tx: Transaction,
) {
  const scope: CategoryScope | undefined =
    kind === "templates"
      ? "looks"
      : ["time", "materials", "looks", "handovers"].includes(kind)
        ? (kind as CategoryScope)
        : undefined;
  if (!scope) return;
  const keys =
    scope === "time" || scope === "materials"
      ? [textValue(data.category)]
      : documentSections(data, scope)
          .filter((section) =>
            section.entries.some((entry) => entry.text.trim() || entry.label?.trim()),
          )
          .map((section) => section.key);
  if (!keys.length) return;
  await lock(context, scope, tx);
  const categories = await tx
    .select({ data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "categories"),
        sql`${records.data}->>'scope'=${scope}`,
      ),
    );
  const permitted = new Set(categories.map((row) => String(row.data.key)));
  if (keys.some((key) => !permitted.has(key)))
    throw new HttpError(400, "Bitte wähle vorhandene Kategorien für diesen Bereich.");
}
