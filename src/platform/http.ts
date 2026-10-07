import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function route<T>(handler: () => Promise<T>) {
  return handler().catch((error: unknown) => {
    if (error instanceof HttpError)
      return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Bitte prüfe deine Eingaben.", details: error.flatten() },
        { status: 400 },
      );
    console.error("DigitalMask request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: (error as { cause?: { code?: string } })?.cause?.code || "unknown",
      // Log locations only; error messages can contain SQL values or private input.
      frames:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => /^\s+at .+:\d+:\d+\)?$/.test(line))
              .slice(0, 5)
          : undefined,
    });
    return NextResponse.json(
      { error: "Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es erneut." },
      { status: 500 },
    );
  });
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.APP_URL)
    throw new HttpError(403, "Diese Anfrage ist nicht zulässig.");
}
export async function readJson(request: Request) {
  assertOrigin(request);
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new HttpError(413, "Die Anfrage ist zu groß.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Ungültige Anfrage.");
  }
}
