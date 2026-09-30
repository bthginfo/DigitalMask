import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route, assertOrigin } from "@/platform/http";
import { getFile, deleteFile } from "@/modules/files/service";
type Props = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: Props) {
  return route(async () => {
    const { row, blob } = await getFile(await requireContext(), (await params).id);
    const name = String(row.data.name).replace(/[\r\n"\\]/g, "_");
    return new Response(blob.stream, {
      headers: {
        "Content-Type": String(row.data.mime),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
export async function DELETE(request: Request, { params }: Props) {
  return route(async () => {
    assertOrigin(request);
    await deleteFile(await requireContext(true), (await params).id);
    return NextResponse.json({ ok: true });
  });
}
