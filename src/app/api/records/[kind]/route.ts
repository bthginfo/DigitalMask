import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { recordKinds } from "@/shared/contracts";
import { saveRecord } from "@/modules/records/service";
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  return route(async () => {
    const kind = z.enum(recordKinds).parse((await params).kind);
    const body = z
      .object({
        data: z.record(z.string(), z.unknown()),
        idempotencyKey: z.string().max(100).optional(),
      })
      .parse(await readJson(request));
    return NextResponse.json(
      await saveRecord(await requireContext(true), kind, {
        ...body.data,
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      }),
      { status: 201 },
    );
  });
}
