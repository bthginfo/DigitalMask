import { googleCalendarConfig } from "./config";

/** A one-shot continuation wakes only when real sync work remains; no periodic DB poll. */
export async function continueGoogleCalendarSync(notBefore: number) {
  if (notBefore > Date.now() + 360000) return;
  if (!process.env.CRON_SECRET) {
    console.error("Google sync continuation unavailable");
    return;
  }
  try {
    const response = await fetch(
      new URL("/api/integrations/google-calendar/worker", googleCalendarConfig().origin),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notBefore }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      console.error("Google sync continuation rejected", { status: response.status });
  } catch {
    console.error("Google sync continuation unavailable");
  }
}
