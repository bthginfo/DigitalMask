import { Redis } from "@upstash/redis";
import { Realtime } from "@upstash/realtime";
import { z } from "zod";
import { after } from "next/server";

export const liveConfigured = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  return (
    URL.canParse(url) &&
    new URL(url).protocol === "https:" &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
};
export const realtime = new Realtime({
  redis: liveConfigured()
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
      })
    : undefined,
  schema: { workspace: { changed: z.object({ revision: z.string() }) } },
  history: { maxLength: 100, expireAfterSecs: 3600 },
  maxDurationSecs: 300,
});
/** Generic invalidation only: no names, messages, IDs or private record payloads. */
export function scheduleLiveChange(departmentId: string) {
  if (!liveConfigured()) return;
  after(async () => {
    const revision = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await realtime
          .channel(`dm:changes:${departmentId}`)
          .emit("workspace.changed", { revision });
        return;
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    // Writes remain successful even when the optional broker is unavailable.
    console.error("Live update delivery failed");
  });
}
