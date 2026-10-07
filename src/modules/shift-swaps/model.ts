import type { DomainRecord } from "@/shared/contracts";
import { calendarPresentation } from "@/shared/calendar-categories";
import type { ShiftSwapStatus } from "./schema";

export const shiftSwapStatusLabels: Record<ShiftSwapStatus, string> = {
  awaiting_partner: "Antwort ausstehend",
  awaiting_admin: "Adminfreigabe ausstehend",
  approved: "Genehmigt",
  declined: "Von Kollegin abgelehnt",
  rejected: "Von Admin abgelehnt",
  withdrawn: "Zurückgezogen",
};
export function eligibleSwapService(event: DomainRecord, categories: DomainRecord[] = []) {
  const presentation = calendarPresentation(event, [], categories);
  return (
    event.kind === "events" &&
    !event.data.leaveId &&
    !presentation.allDay &&
    presentation.background !== "hint"
  );
}
