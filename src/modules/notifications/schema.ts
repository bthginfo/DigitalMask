import { z } from "zod";

// Only browser push services are valid destinations. Never forward server requests to arbitrary URLs.
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      !url.hash &&
      (host === "fcm.googleapis.com" ||
        host === "fcmregistrations.googleapis.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".push.apple.com") ||
        host === "updates.push.services.mozilla.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export const endpointSchema = z
  .string()
  .max(4096)
  .refine(isPushEndpoint, "Ungültiger Mitteilungsdienst.");
const base64Key = (length: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .max(100)
    .refine(
      (value) => Buffer.from(value, "base64url").length === length,
      "Ungültiger Geräteschlüssel.",
    );
export const subscriptionSchema = z
  .object({
    endpoint: endpointSchema,
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: base64Key(65).refine((value) => Buffer.from(value, "base64url")[0] === 4),
        auth: base64Key(16),
      })
      .strict(),
  })
  .strict();
export const pushRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), subscription: subscriptionSchema }).strict(),
  z.object({ action: z.literal("unsubscribe"), endpoint: endpointSchema }).strict(),
  z.object({ action: z.literal("status"), endpoint: endpointSchema }).strict(),
  z.object({ action: z.literal("test"), endpoint: endpointSchema }).strict(),
]);
