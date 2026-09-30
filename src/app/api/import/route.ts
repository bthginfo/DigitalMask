import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext, requireAdmin } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { recordKinds } from "@/shared/contracts";
import { saveRecord } from "@/modules/records/service";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { scheduleEvents } from "@/platform/events";
export const maxDuration = 60;
export async function POST(request: Request) {
  return route(async () => {
    const context = await requireContext(true);
    requireAdmin(context);
    const body = z
      .object({
        kind: z.enum(recordKinds),
        rows: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
      })
      .parse(await readJson(request));
    let imported = 0;
    const errors: { row: number; error: string }[] = [];
    for (const [index, data] of body.rows.entries()) {
      try {
        await saveRecord(context, body.kind, data, undefined, undefined, { deferEffects: true });
        imported++;
      } catch (error) {
        errors.push({
          row: index + 1,
          error: error instanceof Error ? error.message : "Ungültige Daten",
        });
      }
    }
    if (imported) {
      invalidateWorkspace(context.departmentId);
      if (["tasks", "events", "looks", "messages"].includes(body.kind)) scheduleEvents();
    }
    return NextResponse.json({ imported, errors });
  });
}
