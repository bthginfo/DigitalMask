import { handle } from "@upstash/realtime";
import { liveConfigured } from "@/platform/realtime";
import { documentRealtime } from "@/modules/documents/live";
import { documentChannel, verifyDocumentTicket } from "@/modules/documents/ticket";

export const maxDuration = 300;
const stream = handle({
  realtime: documentRealtime,
  middleware: ({ request, channels }) => {
    try {
      const claims = verifyDocumentTicket(
        new URL(request.url).searchParams.get("ticket") || "",
        request.headers.get("cookie") || "",
      );
      if (channels.length !== 1 || channels[0] !== documentChannel(claims.fileId))
        throw new Error();
    } catch {
      return Response.json({ error: "Dokumentzugang abgelaufen." }, { status: 401 });
    }
  },
});
export async function GET(request: Request) {
  if (!liveConfigured())
    return Response.json(
      { error: "Gemeinsames Bearbeiten ist gerade nicht erreichbar." },
      { status: 503 },
    );
  // SSE contains only revision numbers. Each content read rechecks the permission epoch.
  return stream(request);
}
