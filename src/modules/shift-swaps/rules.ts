import type { DomainRecord, Member, RecordData } from "@/shared/contracts";
import { listValue, textValue } from "@/shared/contracts";
import { calendarPresentation } from "@/shared/calendar-categories";
import { occurrences } from "@/modules/calendar/occurrences";
import { HttpError } from "@/platform/http";
import type { ShiftSwapAction, ShiftSwapStatus } from "./schema";
import { eligibleSwapService } from "./model";
export { eligibleSwapService, shiftSwapStatusLabels } from "./model";

export function canReadShiftSwap(member: Pick<Member, "id" | "role">, data: RecordData) {
  return member.role !== "user" || member.id === data.requesterId || member.id === data.partnerId;
}

export function shiftSwapTransition(
  member: Pick<Member, "id" | "role">,
  data: RecordData,
  action: ShiftSwapAction,
): ShiftSwapStatus {
  const status = textValue(data.status);
  if (action === "accept" || action === "decline") {
    if (member.id !== data.partnerId)
      throw new HttpError(403, "Nur die angefragte Person kann auf diese Anfrage antworten.");
    if (status !== "awaiting_partner")
      throw new HttpError(409, "Diese Anfrage wurde bereits beantwortet.");
    return action === "accept" ? "awaiting_admin" : "declined";
  }
  if (action === "withdraw") {
    if (member.id !== data.requesterId)
      throw new HttpError(403, "Nur die anfragende Person kann diese Anfrage zurückziehen.");
    if (!["awaiting_partner", "awaiting_admin"].includes(status))
      throw new HttpError(409, "Diese Anfrage ist bereits abgeschlossen.");
    return "withdrawn";
  }
  if (member.role === "user")
    throw new HttpError(403, "Nur Admins können einen Diensttausch freigeben.");
  if (status !== "awaiting_admin")
    throw new HttpError(409, "Zuerst muss die angefragte Person zustimmen.");
  return action === "approve" ? "approved" : "rejected";
}

export function selectedSwapOccurrence(
  event: DomainRecord,
  selectedStart: string,
  ownerId: string,
  categories: DomainRecord[] = [],
  now = Date.now(),
) {
  if (!eligibleSwapService(event, categories))
    throw new HttpError(
      400,
      "Ganztägige Abwesenheiten und Freiwünsche können nicht getauscht werden.",
    );
  if (!listValue(event.data.participantIds).includes(ownerId))
    throw new HttpError(403, "Der ausgewählte Dienst gehört nicht zu dieser Person.");
  const at = Date.parse(selectedStart);
  if (!Number.isFinite(at) || at <= now)
    throw new HttpError(409, "Es können nur zukünftige Dienste getauscht werden.");
  const selected = occurrences(event, new Date(at), new Date(at + 1)).find(
    (item) => item.start.getTime() === at,
  );
  if (!selected || selected.end <= selected.start)
    throw new HttpError(
      409,
      "Der ausgewählte Termin wurde geändert oder findet nicht mehr statt. Bitte wähle ihn erneut.",
    );
  return selected;
}

export function replacementParticipants(
  event: DomainRecord,
  outgoingId: string,
  incomingId: string,
) {
  const people = listValue(event.data.participantIds);
  if (!people.includes(outgoingId) || people.includes(incomingId))
    throw new HttpError(
      409,
      "Die Personen dieses Dienstes haben sich geändert. Bitte stelle eine neue Anfrage.",
    );
  return [...new Set(people.map((id) => (id === outgoingId ? incomingId : id)))];
}

export interface SwapTransfer {
  event: DomainRecord;
  start: Date;
  end: Date;
  outgoingId: string;
  incomingId: string;
}

/** Service backgrounds may overlay appointments; absences and two duties still conflict. */
export function findSwapConflict(
  transfers: SwapTransfer[],
  calendar: DomainRecord[],
  categories: DomainRecord[],
) {
  for (const transfer of transfers) {
    const proposed = calendarPresentation(transfer.event, [], categories);
    for (const other of calendar) {
      if (
        other.kind !== "events" ||
        !listValue(other.data.participantIds).includes(transfer.incomingId)
      )
        continue;
      const presentation = calendarPresentation(other, [], categories);
      if (presentation.background === "hint") continue;
      const blocks =
        presentation.allDay ||
        other.data.leaveId ||
        (proposed.background === "service" && presentation.background === "service") ||
        (proposed.blocksTime && presentation.blocksTime);
      if (!blocks) continue;
      const overlap = occurrences(other, transfer.start, transfer.end).some((item) => {
        // Only the selected occurrence is removed by a reciprocal transfer, never its series.
        const removed = transfers.some(
          (moving) =>
            moving.event.id === other.id &&
            moving.start.getTime() === item.start.getTime() &&
            moving.outgoingId === transfer.incomingId,
        );
        return !removed && item.start < transfer.end && item.end > transfer.start;
      });
      if (overlap) return { userId: transfer.incomingId, eventId: other.id };
    }
  }
  return undefined;
}
