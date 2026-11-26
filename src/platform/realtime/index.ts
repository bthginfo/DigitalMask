import { Redis } from "@upstash/redis";
import { Realtime } from "@upstash/realtime";
import { z } from "zod";
import { after } from "next/server";
import { headers } from "next/headers";
import { liveRedis, permissionEpochKey } from "./redis";
import { recordKinds, type RecordKind } from "@/shared/contracts";
import { clientOriginHeader, clientOriginValue, permissionKinds } from "@/shared/workspace-sync";

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
      changed: z.object({
        revision: z.string(),
        kinds: z.array(z.enum(recordKinds)).optional(),
        /** Per-tab id of the writing tab, so that tab can ignore its own echo. */
        origin: z.string().optional(),
      }),
    },
  },
  history: { maxLength: 100, expireAfterSecs: 3600 },
  maxDurationSecs: 300,
});

export interface LiveChangeOptions {
  /**
   * Per-tab id of the writer. Omitted: taken from the current request's `x-dm-client` header.
   * `null`: background work (outbox worker, cron) that no browser tab wrote.
   */
  origin?: string | null;
  /** Renew document capabilities although no permission-relevant kind changed. */
  permissions?: boolean;
}

/** Started synchronously in the request scope, awaited later inside `after()`. */
function requestOrigin(): Promise<string | undefined> {
  try {
    return headers()
      .then((list) => clientOriginValue(list.get(clientOriginHeader)))
      .catch(() => undefined);
  } catch {
    // Outside a request scope (scripts, tests) no tab wrote the change.
    return Promise.resolve(undefined);
  }
}

/** Document tickets depend only on productions, chats, files and memberships. */
export function changesPermissions(kinds?: readonly RecordKind[], force = false) {
  return force || !kinds || kinds.some((kind) => permissionKinds.includes(kind));
}

/** Generic invalidation only: no names, messages, IDs or private record payloads. */
export function scheduleLiveChange(
  departmentId: string,
  kinds?: readonly RecordKind[],
  options: LiveChangeOptions = {},
) {
  if (!liveConfigured()) return;
  const origin =
    options.origin === undefined ? requestOrigin() : Promise.resolve(options.origin ?? undefined);
  const renewPermissions = changesPermissions(kinds, options.permissions);
  after(async () => {
    const revision = crypto.randomUUID();
    const writer = await origin;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Document capabilities must be renewed after access or parent records change.
        if (renewPermissions) await liveRedis().set(permissionEpochKey(departmentId), revision);
        await realtime.channel(`dm:changes:${departmentId}`).emit("workspace.changed", {
          revision,
          ...(kinds ? { kinds: [...new Set(kinds)] } : {}),
          ...(writer ? { origin: writer } : {}),
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
