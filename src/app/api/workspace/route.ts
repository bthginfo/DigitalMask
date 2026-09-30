import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { getWorkspace } from "@/modules/records/workspace";
export async function GET() {
  return route(async () =>
    NextResponse.json(await getWorkspace(await requireContext()), {
      headers: { "Cache-Control": "private, no-store" },
    }),
  );
}
