import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/platform/db";
import { recordHistory } from "@/platform/db/schema";
import { requireContext } from "@/platform/context";
import { findRecord } from "@/modules/records/repository";
import { assertRead } from "@/modules/records/service";
import { route } from "@/platform/http";
export async function GET(request: Request) {
  return route(async () => {
    const context = await requireContext();
    const record = await findRecord(context, new URL(request.url).searchParams.get("id") || "");
    await assertRead(context, record);
    const versions = await db
      .select()
      .from(recordHistory)
      .where(eq(recordHistory.recordId, record.id))
      .orderBy(desc(recordHistory.version))
      .limit(50);
    return NextResponse.json({ versions }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
