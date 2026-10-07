import { z } from "zod";
import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { decideShiftSwap } from "@/modules/shift-swaps/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () =>
    NextResponse.json(
      await decideShiftSwap(
        await requireContext(true),
        z
          .string()
          .min(1)
          .max(100)
          .parse((await params).id),
        await readJson(request),
      ),
    ),
  );
}
