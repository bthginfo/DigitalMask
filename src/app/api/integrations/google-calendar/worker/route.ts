import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { drainEvents } from "@/platform/events";
export const maxDuration = 300;
export async function POST(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  const actual = request.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const notBefore = Number(body?.notBefore);
  if (!Number.isFinite(notBefore) || notBefore > Date.now() + 360000)
    return NextResponse.json({ error: "Ungültiger Zeitpunkt." }, { status: 400 });
  const deadline = Date.now() + 240000;
  after(async () => {
    // No database connection or lease is held while honoring Google's cooldown.
    while (Date.now() < Math.min(notBefore, deadline - 15000))
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(45000, notBefore - Date.now(), deadline - 15000 - Date.now())),
      );
    if (notBefore > Date.now()) {
      const { continueGoogleCalendarSync } = await import("@/modules/google-calendar/continuation");
      await continueGoogleCalendarSync(notBefore);
      return;
    }
    await drainEvents(deadline).catch(() => console.error("Google sync continuation failed"));
  });
  return NextResponse.json(
    { queued: true },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
