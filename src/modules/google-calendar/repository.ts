import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/platform/db";
import { googleCalendarConnections } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { openGoogleSecret, sealGoogleSecret } from "./crypto";
import { GoogleCalendarClient, refreshGoogleTokens, type GoogleTokens } from "./provider";
import { googleCalendarConfigured } from "./config";
import type { GoogleCalendarStatus } from "./contracts";

export type GoogleConnection = typeof googleCalendarConnections.$inferSelect;
export const googleTokenPurpose = (row: Pick<GoogleConnection, "id" | "userId" | "departmentId">) =>
  `google-calendar-tokens:${row.departmentId}:${row.userId}:${row.id}`;

export async function findGoogleConnection(context: Context) {
  const [row] = await db
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.userId, context.user.id),
        eq(googleCalendarConnections.departmentId, context.departmentId),
      ),
    )
    .limit(1);
  return row;
}

export async function googleCalendarStatus(context: Context): Promise<GoogleCalendarStatus> {
  if (!googleCalendarConfigured()) return { configured: false, connection: null };
  const row = await findGoogleConnection(context);
  return publicGoogleCalendarStatus(row);
}

export function publicGoogleCalendarStatus(row?: GoogleConnection): GoogleCalendarStatus {
  return {
    configured: true,
    connection: row
      ? {
          email: row.email,
          calendarId: row.calendarId,
          calendarName: row.calendarName,
          selection: row.selection,
          status: row.status,
          lastSyncedAt: row.lastSyncedAt?.toISOString() || null,
          error: row.lastError,
        }
      : null,
  };
}

/** A bounded database lease prevents sync, settings and token refresh from racing. */
export async function withGoogleConnection<T>(
  id: string,
  run: (row: GoogleConnection, token: string) => Promise<T>,
  context?: Context,
): Promise<T> {
  const token = crypto.randomUUID();
  const [row] = await db
    .update(googleCalendarConnections)
    .set({ lockToken: token, lockedUntil: new Date(Date.now() + 360000) })
    .where(
      and(
        eq(googleCalendarConnections.id, id),
        context ? eq(googleCalendarConnections.userId, context.user.id) : undefined,
        context ? eq(googleCalendarConnections.departmentId, context.departmentId) : undefined,
        or(
          isNull(googleCalendarConnections.lockedUntil),
          lt(googleCalendarConnections.lockedUntil, new Date()),
        ),
      ),
    )
    .returning();
  if (!row)
    throw new HttpError(
      409,
      "Der Google-Abgleich läuft gerade. Bitte versuche es in einem Moment erneut.",
    );
  try {
    return await run(row, token);
  } finally {
    try {
      await db
        .update(googleCalendarConnections)
        .set({ lockToken: null, lockedUntil: null })
        .where(
          and(eq(googleCalendarConnections.id, id), eq(googleCalendarConnections.lockToken, token)),
        );
    } catch {
      // Successful writes remain successful; a bounded lease expires even if cleanup is unavailable.
      console.error("Google calendar lease cleanup unavailable");
    }
  }
}

export function googleConnectionTokens(row: GoogleConnection) {
  return openGoogleSecret<GoogleTokens>(row.credentials, googleTokenPurpose(row));
}

/** Call while holding the connection lease. A refresh is needed at most once per hour. */
export async function googleConnectionClient(row: GoogleConnection) {
  let tokens = googleConnectionTokens(row);
  if (tokens.expiresAt <= Date.now() + 60000) {
    tokens = await refreshGoogleTokens(tokens);
    row.credentials = sealGoogleSecret(tokens, googleTokenPurpose(row));
    await db
      .update(googleCalendarConnections)
      .set({ credentials: row.credentials, updatedAt: new Date() })
      .where(eq(googleCalendarConnections.id, row.id));
  }
  return new GoogleCalendarClient(tokens.accessToken);
}
