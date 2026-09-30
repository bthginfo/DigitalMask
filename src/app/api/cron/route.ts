import { NextResponse } from "next/server";
import { processEvents } from "@/platform/events";
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  return NextResponse.json(await processEvents());
}
