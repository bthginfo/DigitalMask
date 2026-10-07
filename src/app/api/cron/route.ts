import { NextResponse } from "next/server";
import { processEvents } from "@/platform/events";
import { checkpointDirtyDocuments } from "@/modules/documents/service";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  const events = await processEvents();
  const documents = await checkpointDirtyDocuments();
  return NextResponse.json({ ...events, documents });
}
