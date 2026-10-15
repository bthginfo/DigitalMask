import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import {
  googleCalendarConnections,
  googleCalendarEvents,
  memberships,
  records,
  user,
} from "@/platform/db/schema";
import { HttpError } from "@/platform/http";
import { serialize } from "@/modules/records/repository";
import { googleCalendarConfigured } from "./config";
import { GoogleCalendarError } from "./provider";
import { buildGoogleEvent, googleEventFingerprint, matchesGoogleSelection } from "./presentation";
import { googleConnectionClient, withGoogleConnection } from "./repository";
import {
  newGoogleEventId,
  removeMappedGoogleEvent,
  upsertMappedGoogleEvent,
  type GoogleEventMapping,
} from "./reconcile";
import { googleConnectionTargets } from "./targets";

export type GoogleSyncProgress = { more: boolean; nextAt?: number };
const mappingKey = (calendarId: string, recordId: string) => JSON.stringify([calendarId, recordId]);

/** One department snapshot and one lease per Google account, shared by all its calendars. */
export async function syncGoogleCalendars(
  departmentId: string,
  deadline = Date.now() + 170000,
): Promise<GoogleSyncProgress> {
  if (!googleCalendarConfigured()) return { more: false };
  const connections = await db
    .select({
      id: googleCalendarConnections.id,
      retryAfter: googleCalendarConnections.retryAfter,
      retryCount: googleCalendarConnections.retryCount,
    })
    .from(googleCalendarConnections)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, googleCalendarConnections.userId),
        eq(memberships.departmentId, googleCalendarConnections.departmentId),
      ),
    )
    .where(
      and(
        eq(googleCalendarConnections.departmentId, departmentId),
        eq(memberships.status, "active"),
        eq(googleCalendarConnections.status, "active"),
      ),
    );
  if (!connections.length) return { more: false };
  let nextAt: number | undefined;
  let more = false;
  const defer = (time: number) => {
    more = true;
    nextAt = Math.min(nextAt ?? Infinity, time);
  };
  const ready = connections.filter((connection) => {
    if (connection.retryAfter && +connection.retryAfter > Date.now()) {
      more = true;
      if (connection.retryCount < 5) defer(+connection.retryAfter);
      return false;
    }
    return true;
  });
  if (!ready.length) return { more, nextAt };
  const [rows, members] = await Promise.all([
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, departmentId),
          inArray(records.kind, ["events", "productions", "calendarCategories"]),
        ),
      ),
    db
      .select({ id: user.id, name: user.name })
      .from(memberships)
      .innerJoin(user, eq(memberships.userId, user.id))
      .where(and(eq(memberships.departmentId, departmentId), eq(memberships.status, "active"))),
  ]);
  const snapshot = rows.map(serialize);
  const references = {
    productions: snapshot.filter((row) => row.kind === "productions"),
    categories: snapshot.filter((row) => row.kind === "calendarCategories"),
    members,
  };
  const events = snapshot.filter((row) => row.kind === "events");
  let failure: unknown;
  for (const connection of ready) {
    if (Date.now() >= deadline - 10000) {
      defer(Date.now());
      break;
    }
    try {
      const unfinished = await withGoogleConnection(connection.id, async (row) => {
        if (row.status !== "active") return false;
        const desired = new Map<
          string,
          {
            recordId: string;
            calendarId: string;
            body: ReturnType<typeof buildGoogleEvent>;
            fingerprint: string;
          }
        >();
        const bodies = new Map<string, ReturnType<typeof buildGoogleEvent>>();
        for (const target of googleConnectionTargets(row))
          for (const event of events) {
            if (!matchesGoogleSelection(event, target.selection, row.userId)) continue;
            let body = bodies.get(event.id);
            if (!body) {
              body = buildGoogleEvent(event, row.id, references);
              bodies.set(event.id, body);
            }
            desired.set(mappingKey(target.calendarId, event.id), {
              recordId: event.id,
              calendarId: target.calendarId,
              body,
              fingerprint: googleEventFingerprint(body),
            });
          }
        const mappings = await db
          .select()
          .from(googleCalendarEvents)
          .where(eq(googleCalendarEvents.connectionId, row.id));
        const byKey = new Map(
          mappings.map((item) => [mappingKey(item.calendarId, item.recordId), item]),
        );
        const obsolete = mappings.filter(
          (item) => !desired.has(mappingKey(item.calendarId, item.recordId)),
        );
        const changed = [...desired].filter(
          ([key, target]) => byKey.get(key)?.fingerprint !== target.fingerprint,
        );
        const removals = obsolete.slice(0, 40);
        const updates = changed.slice(0, 40 - removals.length);
        const added: GoogleEventMapping[] = updates
          .filter(([key]) => !byKey.has(key))
          .map(([, target]) => ({
            id: crypto.randomUUID(),
            connectionId: row.id,
            recordId: target.recordId,
            calendarId: target.calendarId,
            googleEventId: newGoogleEventId(),
            fingerprint: "",
            etag: null,
          }));
        if (added.length) {
          await db.insert(googleCalendarEvents).values(added);
          for (const item of added) byKey.set(mappingKey(item.calendarId, item.recordId), item);
        }
        const client =
          removals.length || updates.length ? await googleConnectionClient(row) : undefined;
        const removed: string[] = [];
        const written: GoogleEventMapping[] = [];
        let error: unknown;
        const work = [
          ...removals.map((item) => async () => {
            await removeMappedGoogleEvent(client!, item);
            removed.push(item.id);
          }),
          ...updates.map(([key, target]) => async () => {
            const item = byKey.get(key)!;
            const remote = await upsertMappedGoogleEvent(
              client!,
              item,
              target.body,
              async (eventId) => {
                await db
                  .update(googleCalendarEvents)
                  .set({ googleEventId: eventId, fingerprint: "", etag: null })
                  .where(eq(googleCalendarEvents.id, item.id));
                item.googleEventId = eventId;
              },
            );
            written.push({ ...item, fingerprint: target.fingerprint, etag: remote.etag || null });
          }),
        ];
        const connectionDeadline = Math.min(deadline - 10000, Date.now() + 45000);
        let completed = 0;
        // Deliberately sequential: the client also spaces every API request by 650 ms.
        for (const run of work) {
          if (Date.now() >= connectionDeadline) break;
          try {
            await run();
            completed++;
          } catch (cause) {
            error = cause;
            break;
          }
        }
        if (removed.length)
          await db
            .delete(googleCalendarEvents)
            .where(
              and(
                eq(googleCalendarEvents.connectionId, row.id),
                inArray(googleCalendarEvents.id, removed),
              ),
            );
        if (written.length)
          await db
            .insert(googleCalendarEvents)
            .values(written)
            .onConflictDoUpdate({
              target: googleCalendarEvents.id,
              set: { fingerprint: sql`excluded.fingerprint`, etag: sql`excluded.etag` },
            });
        if (error) throw error;
        const remaining =
          obsolete.length > removals.length ||
          changed.length > updates.length ||
          completed < work.length;
        await db
          .update(googleCalendarConnections)
          .set({
            lastError: null,
            retryAfter: null,
            retryCount: 0,
            ...(!remaining ? { lastSyncedAt: new Date() } : {}),
          })
          .where(eq(googleCalendarConnections.id, row.id));
        return remaining;
      });
      if (unfinished) defer(Date.now());
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        defer(Date.now() + 45000);
        continue;
      }
      if (error instanceof GoogleCalendarError) {
        if (["reconnect", "permission"].includes(error.code)) {
          continue;
        }
        if (["quota", "unavailable"].includes(error.code)) {
          more = true;
          if (connection.retryCount < 4) defer(Date.now() + Math.max(error.retryAfterMs, 15000));
          console.warn("Google calendar sync paused", {
            code: error.code,
            status: error.status,
            reason: error.reason,
          });
          continue;
        }
      }
      failure ||= error;
    }
  }
  if (failure) throw failure;
  return { more, nextAt };
}
