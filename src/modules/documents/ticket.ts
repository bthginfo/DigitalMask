import { createHmac, timingSafeEqual } from "node:crypto";
import type { DocumentFormat } from "./contracts";
import { HttpError } from "@/platform/http";

export interface DocumentClaims {
  fileId: string;
  departmentId: string;
  userId: string;
  canEdit: boolean;
  format: DocumentFormat;
  epoch: string;
  expiresAt: number;
  binding: string;
}
const digest = (value: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET || "")
    .update(value)
    .digest("base64url");
function sessionBinding(cookie: string) {
  const tokens = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(?:__Secure-)?better-auth\.session_token=/.test(part))
    .sort();
  return tokens.length ? digest(tokens.join(";")) : "";
}
export const documentChannel = (fileId: string) => `dm:document:${fileId}`;
export function createDocumentTicket(
  claims: Omit<DocumentClaims, "expiresAt" | "binding">,
  cookie: string,
  now = Date.now(),
) {
  if (!process.env.BETTER_AUTH_SECRET || !sessionBinding(cookie))
    throw new HttpError(401, "Bitte melde dich erneut an.");
  const expiresAt = now + 30 * 60_000;
  const payload = Buffer.from(
    JSON.stringify({ ...claims, expiresAt, binding: sessionBinding(cookie) }),
  ).toString("base64url");
  return {
    ticket: `${payload}.${digest(payload)}`,
    expiresAt,
    channel: documentChannel(claims.fileId),
    cursor: String(now),
  };
}
export function verifyDocumentTicket(
  ticket: string,
  cookie: string,
  fileId?: string,
  now = Date.now(),
): DocumentClaims {
  try {
    if (!process.env.BETTER_AUTH_SECRET || ticket.length > 2500 || !sessionBinding(cookie))
      throw new Error();
    const [payload, signature, extra] = ticket.split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = Buffer.from(digest(payload)),
      supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      throw new Error();
    const claims: DocumentClaims = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      claims.binding !== sessionBinding(cookie) ||
      !Number.isFinite(claims.expiresAt) ||
      claims.expiresAt <= now ||
      claims.expiresAt > now + 31 * 60_000 ||
      typeof claims.fileId !== "string" ||
      typeof claims.departmentId !== "string" ||
      typeof claims.userId !== "string" ||
      typeof claims.epoch !== "string" ||
      typeof claims.canEdit !== "boolean" ||
      !["text", "sheet", "pdf"].includes(claims.format) ||
      (fileId && claims.fileId !== fileId)
    )
      throw new Error();
    return claims;
  } catch {
    throw new HttpError(409, "Der Dokumentzugang muss erneuert werden.", {
      code: "document_session_expired",
    });
  }
}
