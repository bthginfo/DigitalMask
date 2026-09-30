import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import type { DomainRecord, RecordKind } from "@/shared/contracts";
import { HttpError } from "@/platform/http";
export function serialize(row: typeof records.$inferSelect): DomainRecord {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
export async function findRecord(
  context: Context,
  id: string,
  kind?: RecordKind,
  tx: Transaction | typeof db = db,
  lock = false,
) {
  const query = tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.id, id),
        eq(records.departmentId, context.departmentId),
        kind ? eq(records.kind, kind) : undefined,
      ),
    )
    .limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new HttpError(404, "Der Eintrag wurde nicht gefunden.");
  return row;
}
export const projectVisible = (
  context: Context,
  production: DomainRecord | typeof records.$inferSelect,
) =>
  context.user.role !== "user" ||
  !Array.isArray(production.data.memberIds) ||
  production.data.memberIds.length === 0 ||
  production.data.memberIds.includes(context.user.id);
export async function assertProject(
  context: Context,
  productionId: unknown,
  tx: Transaction | typeof db = db,
) {
  if (typeof productionId !== "string" || !productionId) return;
  const production = await findRecord(context, productionId, "productions", tx);
  if (!projectVisible(context, production))
    throw new HttpError(403, "Du hast keinen Zugriff auf diese Produktion.");
  return production;
}
