import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import type { Context } from "@/platform/context";
import { records } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";
import type { MaskPlanData } from "./schema";

/** One batch for every linked actor; no reads for free-text appointments. */
export async function validateMaskPlanActors(
  context: Context,
  plan: MaskPlanData,
  tx: Transaction,
) {
  const ids = [...new Set(plan.blocks.flatMap((block) => block.actorIds))];
  if (!ids.length) return;
  const rows = await tx
    .select({
      id: records.id,
      kind: records.kind,
      actorId: sql<string>`${records.data}->>'actorId'`,
    })
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        or(
          and(eq(records.kind, "actors"), inArray(records.id, ids)),
          and(eq(records.kind, "casting"), eq(records.productionId, plan.productionId)),
        ),
      ),
    );
  const actors = new Set(rows.filter((row) => row.kind === "actors").map((row) => row.id));
  const cast = new Set(rows.filter((row) => row.kind === "casting").map((row) => row.actorId));
  if (ids.some((id) => !actors.has(id)))
    throw new HttpError(400, "Eine ausgewählte Schauspielperson gehört nicht zu eurem Katalog.");
  if (ids.some((id) => !cast.has(id)))
    throw new HttpError(
      400,
      "Bitte nimm die Schauspielperson zuerst in die Besetzung dieser Produktion auf oder trage einen freien Namen ein.",
    );
}
