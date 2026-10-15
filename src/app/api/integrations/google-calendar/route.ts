import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { googleCalendarStatus } from "@/modules/google-calendar/repository";
import {
  disconnectGoogleCalendar,
  googleCalendarOperation,
  saveGoogleCalendar,
} from "@/modules/google-calendar/service";
export const maxDuration = 300;
const noStore = { headers: { "Cache-Control": "no-store" } };
export function GET() {
  return route(async () =>
    NextResponse.json(await googleCalendarStatus(await requireContext()), noStore),
  );
}
export function PUT(request: Request) {
  return route(() =>
    googleCalendarOperation(async () => {
      const input = z
        .object({
          calendarId: z.string().min(1).max(1024),
          selection: z.unknown(),
          connectionId: z.string().min(1).max(128).optional(),
          previousCalendarId: z.string().min(1).max(1024).optional(),
        })
        .parse(await readJson(request));
      const context = await requireContext(true);
      return NextResponse.json(
        await saveGoogleCalendar(
          context,
          input.calendarId,
          input.selection,
          input.connectionId,
          input.previousCalendarId,
        ),
        noStore,
      );
    }),
  );
}
export function DELETE(request: Request) {
  return route(() =>
    googleCalendarOperation(async () => {
      const input = z
        .object({
          connectionId: z.string().min(1).max(128).optional(),
          calendarId: z.string().min(1).max(1024).optional(),
        })
        .parse(await readJson(request));
      const context = await requireContext(true);
      return NextResponse.json(
        await disconnectGoogleCalendar(context, input.connectionId, input.calendarId),
        noStore,
      );
    }),
  );
}
