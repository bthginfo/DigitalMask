import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { listValue, textValue, type DomainRecord, type RecordKind } from "@/shared/contracts";
import { occurrences } from "@/modules/calendar/occurrences";
import { isShowEvent } from "@/modules/calendar/show-events";
import { THEATER_ZONE } from "@/modules/time-tracking/rules";

/**
 * Someone working a performance or rehearsal of a production outside their own production team
 * may read what that evening needs: mask plans, published Aufschriebe (incl. Umzüge) and figures.
 * Nothing here grants writing; production tasks, chats, time and documents stay team-only.
 */
export const guestReadableKinds: ReadonlySet<RecordKind> = new Set([
  "maskPlans",
  "looks",
  "characters",
]);
export const guestWindowDays = { before: 1, after: 60 } as const;

/** Theatre-local days [today − 1, today + 60], inclusive. */
export function guestAccessWindow(now: number | Date = Date.now()) {
  const day = formatInTimeZone(now, THEATER_ZONE, "yyyy-MM-dd");
  const shift = (days: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const first = shift(-guestWindowDays.before);
  const last = shift(guestWindowDays.after + 1);
  return {
    day,
    from: fromZonedTime(`${first}T00:00:00`, THEATER_ZONE),
    to: fromZonedTime(`${last}T00:00:00`, THEATER_ZONE),
  };
}

/** Production IDs of the user's performances and rehearsals inside the guest window. */
export function guestProductionIdsFrom(
  events: DomainRecord[],
  categories: DomainRecord[],
  userId: string,
  now: number | Date = Date.now(),
) {
  const { from, to } = guestAccessWindow(now);
  const ids = new Set<string>();
  for (const event of events) {
    const productionId = textValue(event.data.productionId);
    if (
      event.kind !== "events" ||
      !productionId ||
      ids.has(productionId) ||
      event.data.leaveId ||
      !listValue(event.data.participantIds).includes(userId) ||
      !isShowEvent(event, categories)
    )
      continue;
    if (occurrences(event, from, to).length) ids.add(productionId);
  }
  return [...ids].sort();
}

/** Read-only guest access for one record of a guest production. */
export function guestCanRead(kind: RecordKind, productionId: unknown, guestIds: Iterable<string>) {
  const id = textValue(productionId);
  return !!id && guestReadableKinds.has(kind) && new Set(guestIds).has(id);
}

/** Client view: the production is readable only through guest access. */
export function isGuestProduction(
  workspace: { guestProductionIds?: string[] },
  productionId: unknown,
) {
  const id = textValue(productionId);
  return !!id && !!workspace.guestProductionIds?.includes(id);
}
