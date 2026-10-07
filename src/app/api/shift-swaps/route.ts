import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { createShiftSwap } from "@/modules/shift-swaps/service";

export async function POST(request: Request) {
  return route(async () =>
    NextResponse.json(await createShiftSwap(await requireContext(true), await readJson(request)), {
      status: 201,
    }),
  );
}
