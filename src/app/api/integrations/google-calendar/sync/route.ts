import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { requestGoogleCalendarSync } from "@/modules/google-calendar/service";
export const maxDuration = 300;
export function POST(request: Request) {
  return route(async () => {
    await readJson(request);
    await requestGoogleCalendarSync(await requireContext(true));
    return NextResponse.json({ queued: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
