/** A persisted per-account cooldown is shared by UI actions and background invocations. */
export function googleRetryDelay(attempt: number, retryAfterMs = 0, random = Math.random()) {
  return (
    Math.max(retryAfterMs, Math.min(300000, 15000 * 2 ** Math.min(attempt, 5))) +
    Math.floor(Math.max(0, Math.min(1, random)) * 3000)
  );
}
export function googleRetryAfter(header: string | null, now = Date.now()) {
  if (!header) return 0;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
