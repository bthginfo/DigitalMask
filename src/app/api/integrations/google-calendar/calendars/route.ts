import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { googleCalendarOperation, listGoogleCalendars } from "@/modules/google-calendar/service";
export function GET() {
  return route(() =>
    googleCalendarOperation(async () =>
      NextResponse.json(
        { calendars: await listGoogleCalendars(await requireContext(true)) },
        { headers: { "Cache-Control": "no-store" } },
      ),
    ),
  );
}
