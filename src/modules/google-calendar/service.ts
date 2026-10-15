import { eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { googleCalendarConnections } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { scheduleEvents } from "@/platform/events";
import { googleCalendarConfigured } from "./config";
import {
  findGoogleConnection,
  googleConnectionClient,
  googleConnectionTokens,
  publicGoogleCalendarStatus,
  withGoogleConnection,
} from "./repository";
import { GoogleCalendarError, googleCalendarErrorMessage, revokeGoogleTokens } from "./provider";
import { validateGoogleSelection } from "./selection";
import { queueGoogleCalendarSync } from "./queue";

export function requireGoogleCalendarConfigured() {
  if (!googleCalendarConfigured())
    throw new HttpError(503, "Die Google-Kalender-Verbindung wird noch eingerichtet.");
}

async function connection(context: Context) {
  requireGoogleCalendarConfigured();
  const row = await findGoogleConnection(context);
  if (!row) throw new HttpError(404, "Bitte verbinde zuerst dein Google-Konto.");
  return row;
}

export async function googleCalendarOperation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GoogleCalendarError)
      throw new HttpError(502, googleCalendarErrorMessage(error));
    throw error;
  }
}

export async function listGoogleCalendars(context: Context) {
  const row = await connection(context);
  return withGoogleConnection(
    row.id,
    async (locked) => (await googleConnectionClient(locked)).calendars(),
    context,
  );
}

export async function saveGoogleCalendar(context: Context, calendarId: string, input: unknown) {
  const selection = await validateGoogleSelection(context, input);
  const row = await connection(context);
  const result = await withGoogleConnection(
    row.id,
    async (locked) => {
      const target = await (await googleConnectionClient(locked)).destination(calendarId);
      return db.transaction(async (tx) => {
        const [updated] = await tx
          .update(googleCalendarConnections)
          .set({
            calendarId: target.id,
            calendarName: target.name,
            selection,
            status: "active",
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(googleCalendarConnections.id, locked.id))
          .returning();
        await queueGoogleCalendarSync(tx, context);
        return publicGoogleCalendarStatus(updated);
      });
    },
    context,
  );
  scheduleEvents();
  return result;
}

export async function requestGoogleCalendarSync(context: Context) {
  const row = await connection(context);
  if (row.status !== "active")
    throw new HttpError(409, "Bitte verbinde Google erneut und wähle einen Zielkalender.");
  await db.transaction(async (tx) => {
    await queueGoogleCalendarSync(tx, context);
  });
  scheduleEvents();
}

export async function disconnectGoogleCalendar(context: Context) {
  const row = await connection(context);
  await withGoogleConnection(
    row.id,
    async (locked) => {
      // Existing copies remain; disconnect never deletes events from a user's calendar.
      await revokeGoogleTokens(googleConnectionTokens(locked));
      await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.id, locked.id));
    },
    context,
  );
}
