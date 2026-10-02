import { z } from "zod";
import { readJson, route } from "@/platform/http";
import { verifyDocumentTicket } from "@/modules/documents/ticket";
import { readDocumentState } from "@/modules/documents/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { ticket, sinceRevision } = z
      .object({
        ticket: z.string().max(2500),
        sinceRevision: z.number().int().nonnegative().max(2_000_000_000).optional(),
      })
      .parse(await readJson(request));
    const { id } = await params;
    const claims = verifyDocumentTicket(ticket, request.headers.get("cookie") || "", id);
    return Response.json(await readDocumentState(claims, sinceRevision), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
