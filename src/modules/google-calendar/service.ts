import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { googleCalendarConnections, googleCalendarEvents } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { scheduleEvents } from "@/platform/events";
import { googleCalendarConfigured } from "./config";
import {
  listGoogleConnections,
  googleConnectionClient,
  googleConnectionTokens,
  publicGoogleCalendarStatus,
  withGoogleConnection,
} from "./repository";
import { GoogleCalendarError, googleCalendarErrorMessage, revokeGoogleTokens } from "./provider";
import { validateGoogleSelection } from "./selection";
import { queueGoogleCalendarSync } from "./queue";
import { googleConnectionTargets, replaceGoogleTarget } from "./targets";

export function requireGoogleCalendarConfigured() {
  if (!googleCalendarConfigured())
    throw new HttpError(503, "Die Google-Kalender-Verbindung wird noch eingerichtet.");
}

async function connection(context: Context, connectionId?: string) {
  requireGoogleCalendarConfigured();
  const rows = await listGoogleConnections(context);
  if (!connectionId && rows.length > 1)
    throw new HttpError(400, "Bitte wähle zuerst das Google-Konto aus.");
  const row = connectionId ? rows.find((item) => item.id === connectionId) : rows[0];
  if (!row) throw new HttpError(404, "Bitte verbinde zuerst dein Google-Konto.");
  return { row, rows };
}

export async function googleCalendarOperation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GoogleCalendarError)
      throw new HttpError(
        error.code === "quota"
          ? 429
          : error.code === "reconnect"
            ? 401
            : error.code === "permission"
              ? 403
              : 502,
        googleCalendarErrorMessage(error),
      );
    throw error;
  }
}

export async function listGoogleCalendars(context: Context, connectionId?: string) {
  const { row } = await connection(context, connectionId);
  return withGoogleConnection(
    row.id,
    async (locked) => (await googleConnectionClient(locked)).calendars(),
    context,
  );
}

export async function saveGoogleCalendar(
  context: Context,
  calendarId: string,
  input: unknown,
  connectionId?: string,
  previousCalendarId?: string,
) {
  const selection = await validateGoogleSelection(context, input);
  const { row, rows } = await connection(context, connectionId);
  const result = await withGoogleConnection(
    row.id,
    async (locked) => {
      const target = await (await googleConnectionClient(locked)).destination(calendarId);
      let calendars;
      try {
        calendars = replaceGoogleTarget(
          googleConnectionTargets(locked),
          previousCalendarId ||
            (!connectionId ? googleConnectionTargets(locked)[0]?.calendarId : undefined),
          { calendarId: target.id, calendarName: target.name, selection },
        );
      } catch (error) {
        throw new HttpError(
          409,
          error instanceof Error && error.message === "GoogleCalendarDuplicateTarget"
            ? "Dieser Kalender ist bereits verbunden. Wähle ihn oben zum Bearbeiten aus."
            : "Die Kalenderauswahl hat sich geändert oder ist voll. Bitte öffne die Verbindung neu.",
        );
      }
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(googleCalendarConnections)
          .set({
            calendars,
            calendarId: calendars[0].calendarId,
            calendarName: calendars[0].calendarName,
            selection: calendars[0].selection,
            status: "active",
            lastError: null,
            lastSyncedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarConnections.id, locked.id))
          .returning();
        await queueGoogleCalendarSync(tx, context);
        return publicGoogleCalendarStatus(
          rows.map((item) => (item.id === updated.id ? updated : item)),
        );
      });
    },
    context,
  );
  scheduleEvents();
  return result;
}

export async function requestGoogleCalendarSync(context: Context, connectionId?: string) {
  const { row } = await connection(context, connectionId);
  if (row.status !== "active")
    throw new HttpError(409, "Bitte verbinde Google erneut und wähle einen Zielkalender.");
  await db.transaction(async (tx) => {
    await queueGoogleCalendarSync(tx, context);
  });
  scheduleEvents();
}

export async function disconnectGoogleCalendar(
  context: Context,
  connectionId?: string,
  calendarId?: string,
) {
  const { row, rows } = await connection(context, connectionId);
  let remaining = rows.filter((item) => item.id !== row.id);
  await withGoogleConnection(
    row.id,
    async (locked) => {
      // Removing a target keeps the account's other calendars and grant intact.
      if (calendarId) {
        const calendars = googleConnectionTargets(locked).filter(
          (item) => item.calendarId !== calendarId,
        );
        if (calendars.length === googleConnectionTargets(locked).length)
          throw new HttpError(404, "Dieser Kalender ist nicht mehr verbunden.");
        const updated = await db.transaction(async (tx) => {
          await tx
            .delete(googleCalendarEvents)
            .where(
              and(
                eq(googleCalendarEvents.connectionId, row.id),
                eq(googleCalendarEvents.calendarId, calendarId),
              ),
            );
          const [saved] = await tx
            .update(googleCalendarConnections)
            .set({
              calendars,
              calendarId: calendars[0]?.calendarId || null,
              calendarName: calendars[0]?.calendarName || null,
              selection: calendars[0]?.selection || { mode: "mine", memberIds: [context.user.id] },
              status: calendars.length ? locked.status : "connected",
              updatedAt: new Date(),
            })
            .where(eq(googleCalendarConnections.id, row.id))
            .returning();
          return saved;
        });
        remaining = rows.map((item) => (item.id === row.id ? updated : item));
        return;
      }
      // Existing copies remain; disconnect never deletes events from a user's calendar.
      await revokeGoogleTokens(googleConnectionTokens(locked));
      await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.id, locked.id));
    },
    context,
  );
  return publicGoogleCalendarStatus(remaining);
}
