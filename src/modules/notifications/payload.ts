import type { RecordData } from "@/shared/contracts";
import { notificationHref } from "./links";
export function pushPayload(
  type: string,
  noticeId: string,
  userId: string,
  count: number,
  data: RecordData,
) {
  const labels: Record<string, string> = {
    ChatMessageCreatedV1: "Neue Nachricht",
    TaskAssignedV1: "Neue Aufgabe",
    ServiceChangedV1: "Dein Dienstplan wurde geändert",
    ShiftSwapChangedV1: "Neue Information zum Diensttausch",
    LeaveRequestDecidedV1: "Dein Freiwunsch wurde beantwortet",
    LookPublishedV1: "Neuer Aufschrieb",
  };
  return {
    title: `DigitalMask · ${labels[type] || "Neue Mitteilung"}`,
    // Message contents and personal planning details stay inside the authenticated app.
    body: "Öffne DigitalMask, um die Mitteilung zu lesen.",
    url: notificationHref(data, type) || "/",
    tag: noticeId,
    userId,
    unreadCount: Math.max(0, Math.floor(count)),
    timestamp: Date.now(),
  };
}
