import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { drainEvents } from "@/platform/events";
import { runRetention } from "@/platform/retention";
import { checkpointDirtyDocuments } from "@/modules/documents/service";
export const maxDuration = 300;
function authorized(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  const actual = request.headers.get("authorization") || "";
  return (
    !!process.env.CRON_SECRET &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}
export async function GET(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  const started = Date.now();
  const events = await drainEvents(started + 180_000);
  const documents = await checkpointDirtyDocuments();
  // Bounded batches; anything left over is removed by the next daily run.
  const retention = await runRetention(
    new Date(),
    Math.max(Date.now() + 10_000, started + 270_000),
  );
  return NextResponse.json({ ...events, documents, retention });
}
