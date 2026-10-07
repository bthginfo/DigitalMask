import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { assertProject, findRecord } from "@/modules/records/repository";
import { numberValue, textValue, type RecordData } from "@/shared/contracts";
import { availableQuantity, peakReservedQuantity } from "./rules";
import { availabilitySchema } from "./schema";

async function reservationRows(context: Context, materialId: string, tx: Transaction | typeof db) {
  return tx
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "reservations"),
        sql`${records.data}->>'materialId'=${materialId}`,
      ),
    );
}

async function readableMaterial(context: Context, materialId: string, tx: Transaction | typeof db) {
  const material = await findRecord(context, materialId, "materials", tx);
  if (material.organizationId !== context.organizationId)
    throw new HttpError(404, "Der Artikel wurde nicht gefunden.");
  await assertProject(context, material.data.productionId, tx);
  if (material.data.characterId) {
    const character = await findRecord(
      context,
      String(material.data.characterId),
      "characters",
      tx,
    );
    await assertProject(context, character.data.productionId, tx);
  }
  return material;
}

/** Called after the inventory advisory lock and record row lock, inside the same transaction. */
export async function validateReservation(
  context: Context,
  data: RecordData,
  tx: Transaction,
  recordId?: string,
  existing?: typeof records.$inferSelect,
) {
  data.userId = existing?.data.userId || context.user.id;
  const material = await readableMaterial(context, textValue(data.materialId), tx);
  await assertProject(context, data.productionId, tx);
  if (data.actorId) {
    const actor = await findRecord(context, textValue(data.actorId), "actors", tx);
    await assertProject(context, actor.data.productionId, tx);
  }
  if (data.status === "cancelled") return;
  const rows = await reservationRows(context, material.id, tx);
  const available = availableQuantity(
    numberValue(material.data.quantity),
    rows,
    String(data.start),
    String(data.end),
    recordId,
  );
  if (numberValue(data.quantity) > available + 0.000001)
    throw new HttpError(
      409,
      `Für diesen Zeitraum sind nur ${available.toLocaleString("de-DE")} verfügbar. Bitte passe Menge oder Zeitraum an.`,
    );
}

/** Stock reductions may not invalidate ongoing or future reservations. */
export async function validateMaterialCapacity(
  context: Context,
  data: RecordData,
  tx: Transaction,
  recordId?: string,
) {
  if (!recordId) return;
  const rows = await reservationRows(context, recordId, tx);
  const peak = peakReservedQuantity(rows, Date.now());
  if (numberValue(data.quantity) + 0.000001 < peak)
    throw new HttpError(
      409,
      `Für diesen Artikel sind zeitweise ${peak.toLocaleString("de-DE")} reserviert. Passe zuerst die Reservierungen an.`,
    );
}

export async function validateWorkflowDelete(
  context: Context,
  kind: string,
  row: typeof records.$inferSelect,
  tx: Transaction,
) {
  if (kind !== "materials") return;
  const [reservation] = await tx
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "reservations"),
        ne(records.id, row.id),
        sql`${records.data}->>'materialId'=${row.id}`,
      ),
    )
    .limit(1);
  if (reservation)
    throw new HttpError(
      409,
      "Der Artikel hat noch Reservierungen. Entferne zuerst diese Zuordnungen.",
    );
}

/** Explicitly requested preview only; saves always revalidate in the inventory transaction. */
export async function checkAvailability(context: Context, input: unknown) {
  const data = availabilitySchema.parse(input);
  const material = await readableMaterial(context, data.materialId, db);
  if (data.excludeId) {
    const reservation = await findRecord(context, data.excludeId, "reservations");
    await assertProject(context, reservation.data.productionId);
    if (context.user.role === "user" && reservation.data.userId !== context.user.id)
      throw new HttpError(403, "Du kannst nur deine eigene Reservierung ausnehmen.");
    if (reservation.data.materialId !== material.id)
      throw new HttpError(400, "Die Reservierung gehört zu einem anderen Artikel.");
  }
  const rows = await reservationRows(context, material.id, db);
  const available = availableQuantity(
    numberValue(material.data.quantity),
    rows,
    data.start,
    data.end,
    data.excludeId,
  );
  return { available, sufficient: available + 0.000001 >= data.quantity };
}
