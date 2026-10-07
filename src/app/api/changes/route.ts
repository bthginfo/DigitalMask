import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { getChanges } from "@/modules/changes/feed";
export async function GET(request: Request) {
  return route(async () =>
    NextResponse.json(
      await getChanges(
        await requireContext(),
        new URL(request.url).searchParams.get("recordId") || undefined,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    ),
  );
}
