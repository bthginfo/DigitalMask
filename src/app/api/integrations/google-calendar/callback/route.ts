import { route } from "@/platform/http";
import { finishGoogleCalendar } from "@/modules/google-calendar/oauth";
export function GET(request: Request) {
  return route(() => finishGoogleCalendar(request));
}
