import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { requestGoogleCalendarSync } from "@/modules/google-calendar/service";
import { z } from "zod";
export const maxDuration = 300;
export function POST(request: Request) {
  return route(async () => {
    const input = z
      .object({ connectionId: z.string().min(1).max(128).optional() })
      .parse(await readJson(request));
    await requestGoogleCalendarSync(await requireContext(true), input.connectionId);
    return NextResponse.json({ queued: true }, { headers: { "Cache-Control": "no-store" } });
  });
}
