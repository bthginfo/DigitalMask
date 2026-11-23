import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route, assertOrigin, HttpError } from "@/platform/http";
import { getFile, deleteFile } from "@/modules/files/service";
import sharp from "sharp";
type Props = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, { params }: Props) {
  return route(async () => {
    const { row, blob } = await getFile(await requireContext(), (await params).id);
    if (new URL(request.url).searchParams.get("preview") === "thumbnail") {
      if (!["image/jpeg", "image/png", "image/webp"].includes(String(row.data.mime)))
        throw new HttpError(415, "Für diese Datei gibt es keine Bildvorschau.");
      const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
      const preview = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 68 })
        .toBuffer();
      return new Response(new Uint8Array(preview), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const name = String(row.data.name).replace(/[\r\n"\\]/g, "_");
    return new Response(blob.stream, {
      headers: {
        "Content-Type": String(row.data.mime),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
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
