import { NextResponse } from "next/server";
import { requireContext } from "@/platform/context";
import { readJson, route } from "@/platform/http";
import { checkAvailability } from "@/modules/reservations/service";

export async function POST(request: Request) {
  return route(async () =>
    NextResponse.json(await checkAvailability(await requireContext(true), await readJson(request))),
  );
}
