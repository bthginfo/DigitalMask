import { z } from "zod";
import { requireContext } from "@/platform/context";
import { route } from "@/platform/http";
import { exportSharedDocument } from "@/modules/documents/export";

export const maxDuration = 60;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const context = await requireContext(true),
      { id } = await params;
    const url = new URL(request.url);
    const format = z
      .enum(["docx", "xlsx", "pdf", "csv", "txt"])
      .parse(url.searchParams.get("format"));
    const result = await exportSharedDocument(
      context,
      id,
      format,
      url.searchParams.get("sheet") || undefined,
    );
    const bytes = new Uint8Array(result.bytes);
    const stream = new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 65536)
          controller.enqueue(bytes.subarray(offset, offset + 65536));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
