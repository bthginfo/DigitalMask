import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import {
  googleCalendarConnections,
  googleCalendarEvents,
  memberships,
  records,
  user,
} from "@/platform/db/schema";
import { serialize } from "@/modules/records/repository";
import { googleCalendarConfigured } from "./config";
import { googleCalendarErrorMessage, GoogleCalendarError } from "./provider";
import { buildGoogleEvent, googleEventFingerprint, matchesGoogleSelection } from "./presentation";
import { googleConnectionClient, withGoogleConnection, type GoogleConnection } from "./repository";
import {
  newGoogleEventId,
  removeMappedGoogleEvent,
  upsertMappedGoogleEvent,
  type GoogleEventMapping,
} from "./reconcile";

/** Loads the department once per outbox batch; fingerprints avoid unchanged Google writes. */
export async function syncGoogleCalendars(departmentId: string, deadline = Date.now() + 170000) {
  if (!googleCalendarConfigured()) return false;
  const connections = await db
    .select({ id: googleCalendarConnections.id })
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
  if (!connections.length) return false;
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
  let incomplete = false;
  let failure: unknown;
  for (const connection of connections) {
    if (Date.now() >= deadline) {
      incomplete = true;
      break;
    }
    try {
      const more = await withGoogleConnection(connection.id, async (row) => {
        // The lease is acquired before taking a fresh snapshot of the selection.
        if (row.status !== "active") return false;
        const selected = events.filter((event) =>
          matchesGoogleSelection(event, row.selection, row.userId),
        );
        const desired = new Map(
          selected.map((event) => {
            const body = buildGoogleEvent(event, row.id, references);
            return [event.id, { body, fingerprint: googleEventFingerprint(body) }] as const;
          }),
        );
        const mappings = await db
          .select()
          .from(googleCalendarEvents)
          .where(eq(googleCalendarEvents.connectionId, row.id));
        const byRecord = new Map(
          mappings
            .filter((item) => item.calendarId === row.calendarId)
            .map((item) => [item.recordId, item]),
        );
        const obsolete = mappings.filter(
          (item) => item.calendarId !== row.calendarId || !desired.has(item.recordId),
        );
        const changed = [...desired].filter(
          ([id, target]) => byRecord.get(id)?.fingerprint !== target.fingerprint,
        );
        const removals = obsolete.slice(0, 100);
        const updates = row.calendarId ? changed.slice(0, 100 - removals.length) : [];
        const added: GoogleEventMapping[] = updates
          .filter(([id]) => !byRecord.has(id))
          .map(([recordId]) => ({
            id: crypto.randomUUID(),
            connectionId: row.id,
            recordId,
            calendarId: row.calendarId!,
            googleEventId: newGoogleEventId(),
            fingerprint: "",
            etag: null,
          }));
        if (added.length) {
          await db.insert(googleCalendarEvents).values(added);
          for (const item of added) byRecord.set(item.recordId, item);
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
          ...updates.map(([id, target]) => async () => {
            const item = byRecord.get(id)!;
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
        const connectionDeadline = Math.min(deadline, Date.now() + 60000);
        let completed = 0;
        // Three independent calls at a time, below normal per-user API quotas.
        for (let i = 0; i < work.length; i += 3) {
          if (Date.now() >= connectionDeadline) break;
          const results = await Promise.allSettled(work.slice(i, i + 3).map((run) => run()));
          completed += results.length;
          for (const result of results) if (result.status === "rejected") error ||= result.reason;
          if (error) break;
        }
        // Keep successful progress even if a later Google request fails.
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
        const more =
          obsolete.length > removals.length ||
          changed.length > updates.length ||
          completed < work.length;
        if (!more) {
          await db
            .update(googleCalendarConnections)
            .set({ lastSyncedAt: new Date(), lastError: null })
            .where(eq(googleCalendarConnections.id, row.id));
        }
        return more;
      });
      incomplete ||= more;
    } catch (error) {
      if (error instanceof GoogleCalendarError) {
        await db
          .update(googleCalendarConnections)
          .set({
            lastError: googleCalendarErrorMessage(error),
            ...(["reconnect", "permission"].includes(error.code)
              ? { status: "reconnect" as GoogleConnection["status"] }
              : {}),
          })
          .where(eq(googleCalendarConnections.id, connection.id));
        if (["reconnect", "permission"].includes(error.code)) continue;
      }
      failure ||= error;
    }
  }
  if (failure) throw failure;
  return incomplete;
}
