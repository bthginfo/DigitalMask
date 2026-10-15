import { z } from "zod";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { startGoogleCalendar } from "@/modules/google-calendar/oauth";
import { requireGoogleCalendarConfigured } from "@/modules/google-calendar/service";
export function POST(request: Request) {
  return route(async () => {
    const input = z
      .object({ returnTo: z.enum(["calendar", "settings"]) })
      .parse(await readJson(request));
    requireGoogleCalendarConfigured();
    return startGoogleCalendar(await requireContext(true), input.returnTo);
  });
}
