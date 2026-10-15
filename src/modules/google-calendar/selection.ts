import { z } from "zod";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { memberships, records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import type { GoogleCalendarSelection } from "./contracts";

export const googleSelectionSchema = z.object({
  mode: z.enum(["mine", "people", "team"]),
  memberIds: z.array(z.string().min(1).max(128)).max(100).default([]),
  productionId: z.string().max(128).optional(),
  category: z.string().max(100).optional(),
});

export async function validateGoogleSelection(
  context: Context,
  input: unknown,
): Promise<GoogleCalendarSelection> {
  const selection = googleSelectionSchema.parse(input);
  if (selection.mode === "mine") selection.memberIds = [context.user.id];
  if (selection.mode === "team") selection.memberIds = [];
  selection.memberIds = [...new Set(selection.memberIds)];
  if (selection.mode === "people") {
    if (!selection.memberIds.length)
      throw new HttpError(400, "Bitte wähle mindestens eine Person aus.");
    const active = await db
      .select({ id: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.departmentId, context.departmentId),
          eq(memberships.status, "active"),
          ne(memberships.role, "superadmin"),
          inArray(memberships.userId, selection.memberIds),
        ),
      );
    if (active.length !== selection.memberIds.length)
      throw new HttpError(400, "Bitte wähle nur aktive Personen aus deinem Team.");
  }
  // These are shared calendar references, independent of production membership.
  if (selection.productionId) {
    const [production] = await db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "productions"),
          eq(records.id, selection.productionId),
        ),
      )
      .limit(1);
    if (!production) throw new HttpError(400, "Diese Produktion ist nicht mehr vorhanden.");
  }
  if (selection.category) {
    const [category] = await db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "calendarCategories"),
          sql`${records.data}->>'key'=${selection.category}`,
        ),
      )
      .limit(1);
    if (!category) throw new HttpError(400, "Diese Kalenderart ist nicht mehr vorhanden.");
  }
  return {
    mode: selection.mode,
    memberIds: selection.memberIds,
    ...(selection.productionId ? { productionId: selection.productionId } : {}),
    ...(selection.category ? { category: selection.category } : {}),
  };
}
