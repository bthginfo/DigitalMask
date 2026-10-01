import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { getWorkspace } from "@/modules/records/workspace";
import { createLiveTicket } from "@/platform/realtime/ticket";
import { liveConfigured } from "@/platform/realtime";
export async function GET(request: Request) {
  return route(async () => {
    const context = await requireContext();
    const live = liveConfigured()
      ? createLiveTicket(context.departmentId, request.headers.get("cookie") || "")
      : null;
    return NextResponse.json(
      { ...(await getWorkspace(context)), live },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  });
}
