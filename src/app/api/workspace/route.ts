import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { getWorkspace } from "@/modules/records/workspace";
import { createLiveTicket } from "@/platform/realtime/ticket";
import { liveConfigured } from "@/platform/realtime";
import { parseLiveKinds, partialWorkspaceKinds, workspacePatch } from "@/shared/workspace-sync";
import { HttpError } from "@/platform/http";
export async function GET(request: Request) {
  return route(async () => {
    const context = await requireContext();
    const filter = new URL(request.url).searchParams.get("kinds");
    const parsed = filter === null ? undefined : parseLiveKinds(filter.split(","));
    if (filter !== null && !parsed) throw new HttpError(400, "Ungültige Bereiche.");
    const selected = partialWorkspaceKinds(parsed);
    const live = liveConfigured()
      ? createLiveTicket(context.departmentId, request.headers.get("cookie") || "")
      : null;
    const workspace = { ...(await getWorkspace(context, selected)), live };
    return NextResponse.json(selected ? workspacePatch(workspace, selected) : workspace, {
      headers: { "Cache-Control": "private, no-store" },
    });
  });
}
