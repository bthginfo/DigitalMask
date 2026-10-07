import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { undoOperation } from "@/modules/changes/undo";

export async function POST(request: Request) {
  return route(async () => {
    const body = z.object({ operationId: z.string().uuid() }).parse(await readJson(request));
    return NextResponse.json(await undoOperation(await requireContext(true), body.operationId));
  });
}
