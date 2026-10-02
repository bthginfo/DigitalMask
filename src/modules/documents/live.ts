import { Realtime } from "@upstash/realtime";
import { z } from "zod";
import { after } from "next/server";
import { liveConfigured } from "@/platform/realtime";
import { liveRedis } from "@/platform/realtime/redis";
import { documentChannel } from "./ticket";

export const documentRealtime = new Realtime({
  redis: liveConfigured() ? liveRedis() : undefined,
  schema: { document: { changed: z.object({ revision: z.number().int().nonnegative() }) } },
  history: { maxLength: 30, expireAfterSecs: 600 },
  maxDurationSecs: 300,
});
export function notifyDocument(fileId: string, revision: number) {
  after(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await documentRealtime
          .channel(documentChannel(fileId))
          .emit("document.changed", { revision });
        return;
      } catch {
        /* Updates are durable even if the optional wake-up event fails. */
      }
    }
    console.error("Document live event could not be delivered");
  });
}
