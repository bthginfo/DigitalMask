import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route, assertOrigin } from "@/platform/http";
import { recordKinds } from "@/shared/contracts";
import { saveRecord, deleteRecord } from "@/modules/records/service";
type Props = { params: Promise<{ kind: string; id: string }> };
export async function PATCH(request: Request, { params }: Props) {
  return route(async () => {
    const p = await params;
    const kind = z.enum(recordKinds).parse(p.kind);
    const body = z
      .object({ data: z.record(z.string(), z.unknown()), version: z.number().int().positive() })
      .parse(await readJson(request));
    return NextResponse.json(
      await saveRecord(await requireContext(true), kind, body.data, p.id, body.version),
    );
  });
}
export async function DELETE(request: Request, { params }: Props) {
  return route(async () => {
    assertOrigin(request);
    const p = await params;
    const kind = z.enum(recordKinds).parse(p.kind);
    await deleteRecord(await requireContext(true), kind, p.id);
    return NextResponse.json({ ok: true });
  });
}
