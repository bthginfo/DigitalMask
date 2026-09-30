import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
export async function GET() {
  return route(async () =>
    NextResponse.json((await requireContext()).user, {
      headers: { "Cache-Control": "private, no-store" },
    }),
  );
}
