import { handle } from "@upstash/realtime";
import { realtime, liveConfigured } from "@/platform/realtime";
import { verifyLiveTicket } from "@/platform/realtime/ticket";

export const maxDuration = 300;
const stream = handle({
  realtime,
  middleware: ({ request, channels }) => {
    if (
      !verifyLiveTicket(
        new URL(request.url).searchParams.get("ticket") || "",
        request.headers.get("cookie") || "",
        channels,
      )
    )
      return Response.json({ error: "Live-Zugang abgelaufen." }, { status: 401 });
  },
});
export async function GET(request: Request) {
  if (!liveConfigured())
    return Response.json({ error: "Live-Verbindung noch nicht eingerichtet." }, { status: 503 });
  // Tickets bind the authorized department to the login cookie. Reconnects never query Neon.
  return stream(request);
}
