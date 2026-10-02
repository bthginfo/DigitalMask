import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { ensemblePreview, importEnsemble } from "@/modules/ensemble/service";
export const maxDuration = 60;
export async function GET() {
  return route(async () => NextResponse.json(await ensemblePreview(await requireContext(true))));
}
export async function POST(request: Request) {
  return route(async () => {
    const context = await requireContext(true);
    const { sourceIds } = z
      .object({
        sourceIds: z
          .array(z.string().regex(/^\d{1,10}$/))
          .min(1)
          .max(4),
      })
      .parse(await readJson(request));
    return NextResponse.json(await importEnsemble(context, sourceIds));
  });
}
