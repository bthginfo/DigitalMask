import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { HttpError } from "@/platform/http";
export async function throttle(request: Request, action: string, limit = 10) {
  const ip =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "local";
  const key = createHash("sha256").update(`${action}:${ip}`).digest("hex");
  const now = Date.now();
  const result = await db.execute(
    sql`insert into auth_rate_limit(id,key,count,last_request) values(${key},${key},1,${now}) on conflict(key) do update set count=case when auth_rate_limit.last_request<${now - 60000} then 1 else auth_rate_limit.count+1 end,last_request=case when auth_rate_limit.last_request<${now - 60000} then ${now} else auth_rate_limit.last_request end returning count`,
  );
  if (Number(result[0]?.count) > limit)
    throw new HttpError(429, "Zu viele Versuche. Bitte warte eine Minute.");
}
