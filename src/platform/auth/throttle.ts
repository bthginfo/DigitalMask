import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { HttpError } from "@/platform/http";

const throttleId = (action: string, subject: string) =>
  createHash("sha256").update(`${action}:${subject}`).digest("hex");

/** Fixed-window counter in auth_rate_limit; the daily cron removes stale rows. */
export async function throttleSubject(
  action: string,
  subject: string,
  limit: number,
  windowMs = 60_000,
  message = "Zu viele Versuche. Bitte warte eine Minute.",
) {
  const key = throttleId(action, subject);
  const now = Date.now();
  const result = await db.execute(
    sql`insert into auth_rate_limit(id,key,count,last_request) values(${key},${key},1,${now}) on conflict(key) do update set count=case when auth_rate_limit.last_request<${now - windowMs} then 1 else auth_rate_limit.count+1 end,last_request=case when auth_rate_limit.last_request<${now - windowMs} then ${now} else auth_rate_limit.last_request end returning count`,
  );
  if (Number(result[0]?.count) > limit) throw new HttpError(429, message);
}
export async function resetThrottle(action: string, subject: string) {
  const key = throttleId(action, subject);
  await db.execute(sql`delete from auth_rate_limit where key=${key}`);
}
export async function throttle(request: Request, action: string, limit = 10) {
  const ip =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "local";
  await throttleSubject(action, ip, limit);
}
