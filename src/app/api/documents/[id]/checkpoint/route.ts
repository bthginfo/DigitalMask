import { z } from "zod";
import { readJson, route } from "@/platform/http";
import { verifyDocumentTicket } from "@/modules/documents/ticket";
import { checkpointDocument } from "@/modules/documents/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { ticket } = z.object({ ticket: z.string().max(2500) }).parse(await readJson(request));
    const { id } = await params;
    const claims = verifyDocumentTicket(ticket, request.headers.get("cookie") || "", id);
    return Response.json(await checkpointDocument(id, claims.departmentId, claims), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
