import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { type Context } from "@/platform/context";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { auditChange } from "@/platform/events";
import { assertRead } from "@/modules/records/service";
import { cloneMaskPlan, maskPlanValue } from "@/modules/mask-plans/model";
export async function copyProduction(context: Context, id: string, title: string) {
  const result = await db.transaction(async (tx) => {
    const source = await findRecord(context, id, "productions", tx);
    await assertRead(context, source, tx);
    const candidates = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.productionId, id),
          inArray(records.kind, ["characters", "casting", "looks", "tasks", "maskPlans"]),
        ),
      );
    const children = candidates.filter(
      (child) =>
        context.user.role !== "user" ||
        child.kind !== "looks" ||
        child.data.status === "published" ||
        child.createdBy === context.user.id,
    );
    const childIds = children.map((child) => child.id);
    const files = childIds.length
      ? await tx
          .select()
          .from(records)
          .where(
            and(
              eq(records.departmentId, context.departmentId),
              eq(records.kind, "files"),
              eq(records.productionId, id),
              inArray(sql<string>`${records.data}->>'recordId'`, childIds),
            ),
          )
      : [];
    const targetId = crypto.randomUUID();
    const map = new Map([...children, ...files].map((c) => [c.id, crypto.randomUUID()]));
    map.set(id, targetId);
    const [production] = await tx
      .insert(records)
      .values({
        id: targetId,
        kind: "productions",
        organizationId: context.organizationId,
        departmentId: context.departmentId,
        createdBy: context.user.id,
        data: {
          ...source.data,
          title: title || `${source.data.title} · Wiederaufnahme`,
          status: "preparation",
          premiere: "",
          sourceId: id,
        },
      })
      .returning();
    for (const child of [...children, ...files]) {
      const data: Record<string, unknown> = { ...child.data, productionId: targetId };
      for (const field of ["characterId", "parentId", "recordId"]) {
        const old = String(data[field] || "");
        if (map.has(old)) data[field] = map.get(old)!;
      }
      for (const field of ["imageIds", "attachmentIds"]) {
        if (Array.isArray(data[field]))
          data[field] = (data[field] as string[]).map((old) => map.get(old) || old);
      }
      if (child.kind === "tasks") {
        data.status = "todo";
        data.sprintId = "";
        data.due = "";
      }
      if (child.kind === "looks") data.status = data.sections === undefined ? "draft" : "published";
      if (child.kind === "maskPlans")
        Object.assign(data, cloneMaskPlan(maskPlanValue(child.data), targetId));
      await tx.insert(records).values({
        id: map.get(child.id)!,
        kind: child.kind,
        organizationId: context.organizationId,
        departmentId: context.departmentId,
        createdBy: context.user.id,
        productionId: targetId,
        parentId: String(data.parentId || "") || null,
        data,
      });
    }
    await auditChange(tx, context, "production.copied", targetId);
    return serialize(production);
  });
  invalidateWorkspace(context.departmentId);
  return result;
}
