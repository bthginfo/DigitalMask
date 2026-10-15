import { GoogleCalendarError, type GoogleCalendarClient } from "./provider";
import { isManagedGoogleEvent, type GoogleEventBody } from "./presentation";

export type GoogleEventMapping = {
  id: string;
  connectionId: string;
  recordId: string;
  calendarId: string;
  googleEventId: string;
  fingerprint: string;
  etag: string | null;
};
export const newGoogleEventId = () => `dm${crypto.randomUUID().replace(/-/g, "")}`;
const missing = (error: unknown) =>
  error instanceof GoogleCalendarError && error.code === "not-found";

export async function removeMappedGoogleEvent(
  client: Pick<GoogleCalendarClient, "event" | "remove">,
  mapping: GoogleEventMapping,
) {
  try {
    const event = await client.event(mapping.calendarId, mapping.googleEventId);
    if (event.status === "cancelled") return;
    if (!isManagedGoogleEvent(event, mapping.connectionId, mapping.recordId))
      throw new GoogleCalendarError("ownership");
    if (!event.etag) throw new GoogleCalendarError("unavailable");
    await client.remove(mapping.calendarId, mapping.googleEventId, event.etag);
  } catch (error) {
    if (!missing(error)) throw error;
  }
}

/** A pending mapping is persisted before insert, so retry after a lost response is idempotent. */
export async function upsertMappedGoogleEvent(
  client: Pick<GoogleCalendarClient, "event" | "insert" | "update">,
  mapping: GoogleEventMapping,
  body: GoogleEventBody,
  replaceId: (id: string) => Promise<void>,
) {
  if (!mapping.fingerprint) {
    try {
      return await client.insert(mapping.calendarId, mapping.googleEventId, body);
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.code !== "conflict") throw error;
    }
  }
  let remote;
  try {
    remote = await client.event(mapping.calendarId, mapping.googleEventId);
  } catch (error) {
    if (!missing(error)) throw error;
  }
  if (!remote || remote.status === "cancelled") {
    const id = newGoogleEventId();
    await replaceId(id);
    return client.insert(mapping.calendarId, id, body);
  }
  if (!isManagedGoogleEvent(remote, mapping.connectionId, mapping.recordId))
    throw new GoogleCalendarError("ownership");
  if (!remote.etag) throw new GoogleCalendarError("unavailable");
  return client.update(mapping.calendarId, mapping.googleEventId, body, remote.etag);
}
