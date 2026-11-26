import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { liveConfigured } from "@/platform/realtime";
import { createLiveTicket } from "@/platform/realtime/ticket";

/**
 * Renews only the live ticket. Uses the cached session/membership check of requireContext and
 * reads no workspace data, so an hourly renewal no longer reloads the whole workspace.
 */
export async function GET(request: Request) {
  return route(async () => {
    const context = await requireContext();
    const live = liveConfigured()
      ? createLiveTicket(context.departmentId, request.headers.get("cookie") || "")
      : null;
    return NextResponse.json(live, { headers: { "Cache-Control": "private, no-store" } });
  });
}
