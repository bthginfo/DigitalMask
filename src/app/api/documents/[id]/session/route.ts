import { requireContext } from "@/platform/context";
import { assertOrigin, route } from "@/platform/http";
import { openDocument } from "@/modules/documents/service";

export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    assertOrigin(request);
    const context = await requireContext(true);
    const { id } = await params;
    return Response.json(await openDocument(context, id, request.headers.get("cookie") || ""), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
