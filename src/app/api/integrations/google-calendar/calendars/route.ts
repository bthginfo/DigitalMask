import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { googleCalendarOperation, listGoogleCalendars } from "@/modules/google-calendar/service";
import { z } from "zod";
export function GET(request: Request) {
  return route(() =>
    googleCalendarOperation(async () =>
      NextResponse.json(
        {
          calendars: await listGoogleCalendars(
            await requireContext(true),
            z
              .string()
              .min(1)
              .max(128)
              .optional()
              .parse(new URL(request.url).searchParams.get("connectionId") || undefined),
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      ),
    ),
  );
}
