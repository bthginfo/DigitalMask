import { Redis } from "@upstash/redis";
import { HttpError } from "@/platform/http";

let connection: Redis | undefined;
export function liveRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url.startsWith("https://") || !token)
    throw new HttpError(
      503,
      "Gemeinsames Bearbeiten ist gerade nicht erreichbar. Bitte versuche es später erneut.",
    );
  return (connection ??= new Redis({ url, token }));
}
export const permissionEpochKey = (departmentId: string) => `dm:permissions:${departmentId}`;
