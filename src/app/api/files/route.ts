import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { route, assertOrigin, HttpError } from "@/platform/http";
import { recordKinds } from "@/shared/contracts";
import { uploadFile } from "@/modules/files/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return route(async () => {
    assertOrigin(request);
    const context = await requireContext(true);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Bitte wähle eine Datei.");
    const kind = z.enum(recordKinds).parse(form.get("recordKind"));
    return NextResponse.json(
      await uploadFile(context, file, kind, String(form.get("recordId") || "")),
      { status: 201 },
    );
  });
}
