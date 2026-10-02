import type { RecordData } from "@/shared/contracts";

export function safeNotificationLink(link: unknown) {
  if (typeof link !== "string" || !link.startsWith("/?")) return "/";
  try {
    const url = new URL(link, "https://digitalmask.invalid");
    return url.origin === "https://digitalmask.invalid" && url.pathname === "/"
      ? url.pathname + url.search
      : "/";
  } catch {
    return "/";
  }
}
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
    LeaveRequestDecidedV1: "Dein Freiwunsch wurde beantwortet",
    LookPublishedV1: "Neuer Aufschrieb",
  };
  return {
    title: `DigitalMask · ${labels[type] || "Neue Mitteilung"}`,
    // Message contents and personal planning details stay inside the authenticated app.
    body: "Öffne DigitalMask, um die Mitteilung zu lesen.",
    url: safeNotificationLink(data.link),
    tag: noticeId,
    userId,
    unreadCount: Math.max(0, Math.floor(count)),
    timestamp: Date.now(),
  };
}
