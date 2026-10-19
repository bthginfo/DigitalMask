import { Redis } from "@upstash/redis";
import { Realtime } from "@upstash/realtime";
import { z } from "zod";
import { after } from "next/server";
import { liveRedis, permissionEpochKey } from "./redis";
import { recordKinds, type RecordKind } from "@/shared/contracts";

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
  schema: {
    workspace: {
      changed: z.object({ revision: z.string(), kinds: z.array(z.enum(recordKinds)).optional() }),
    },
  },
  history: { maxLength: 100, expireAfterSecs: 3600 },
  maxDurationSecs: 300,
});
/** Generic invalidation only: no names, messages, IDs or private record payloads. */
export function scheduleLiveChange(departmentId: string, kinds?: readonly RecordKind[]) {
  if (!liveConfigured()) return;
  after(async () => {
    const revision = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Document capabilities must be renewed after access or parent records change.
        if (!kinds || kinds.some((kind) => kind !== "notifications"))
          await liveRedis().set(permissionEpochKey(departmentId), revision);
        await realtime
          .channel(`dm:changes:${departmentId}`)
          .emit("workspace.changed", {
            revision,
            ...(kinds ? { kinds: [...new Set(kinds)] } : {}),
          });
        return;
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    // Writes remain successful even when the optional broker is unavailable.
    console.error("Live update delivery failed");
  });
}
