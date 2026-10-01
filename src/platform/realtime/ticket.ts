import { createHmac, timingSafeEqual } from "node:crypto";

const signingKey = () => process.env.BETTER_AUTH_SECRET || "";
const digest = (value: string) =>
  createHmac("sha256", signingKey()).update(value).digest("base64url");
const sessionBinding = (cookie: string) =>
  digest(
    cookie
      .split(";")
      .map((item) => item.trim())
      .filter((item) => /^(?:__Secure-)?better-auth\.session_token=/.test(item))
      .sort()
      .join(";"),
  );
export function createLiveTicket(departmentId: string, cookie: string, now = Date.now()) {
  if (!signingKey()) throw new Error("Auth secret missing");
  const channel = `dm:changes:${departmentId}`;
  const expiresAt = now + 60 * 60 * 1000;
  const payload = Buffer.from(
    JSON.stringify({ channel, expiresAt, binding: sessionBinding(cookie) }),
  ).toString("base64url");
  return { channel, ticket: `${payload}.${digest(payload)}`, expiresAt, cursor: String(now) };
}
export function verifyLiveTicket(
  ticket: string,
  cookie: string,
  channels: string[],
  now = Date.now(),
) {
  if (!signingKey() || ticket.length > 2000) return false;
  try {
    const [payload, signature, extra] = ticket.split(".");
    if (extra || !payload || !signature) return false;
    const expected = Buffer.from(digest(payload));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (
      claims.expiresAt > now &&
      claims.binding === sessionBinding(cookie) &&
      channels.length === 1 &&
      channels[0] === claims.channel
    );
  } catch {
    return false;
  }
}
