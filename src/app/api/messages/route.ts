import { NextResponse } from "next/server";
import { and, eq, gt, desc, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { requireContext, scopeTag } from "@/platform/context";
import { route, HttpError } from "@/platform/http";
import { serialize } from "@/modules/records/repository";
import { getWorkspace } from "@/modules/records/workspace";
export async function GET(request: Request) {
  return route(async () => {
    const context = await requireContext();
    const params = new URL(request.url).searchParams;
    const productionId = params.get("productionId") || "";
    if (
      productionId &&
      !(await getWorkspace(context)).records.productions.some(
        (project) => project.id === productionId,
      )
    )
      throw new HttpError(403, "Du hast keinen Zugriff auf diese Produktion.");
    const after = params.get("after");
    if (after && !Number.isFinite(new Date(after).getTime()))
      throw new HttpError(400, "Ungültiger Zeitpunkt.");
    const list = await unstable_cache(
      () =>
        db
          .select()
          .from(records)
          .where(
            and(
              eq(records.departmentId, context.departmentId),
              eq(records.kind, "messages"),
              productionId ? eq(records.productionId, productionId) : isNull(records.productionId),
              after ? gt(records.updatedAt, new Date(after)) : undefined,
            ),
          )
          .orderBy(desc(after ? records.updatedAt : records.createdAt))
          .limit(100),
      ["messages", context.departmentId, productionId, after || ""],
      { revalidate: 30, tags: [scopeTag(context.departmentId)] },
    )();
    return NextResponse.json(
      { messages: list.map(serialize).reverse() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
