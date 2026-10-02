import type { DomainRecord } from "@/shared/contracts";
export function isChatNotice(record: DomainRecord) {
  return (
    record.data.type === "ChatMessageCreatedV1" ||
    /^Neue (private Nachricht|Nachricht)/.test(String(record.data.title || ""))
  );
}
export function chatUnreadCounts(notifications: DomainRecord[], userId: string) {
  const result = {
    total: 0,
    general: 0,
    conversations: {} as Record<string, number>,
    productions: {} as Record<string, number>,
  };
  for (const notice of notifications) {
    if (notice.data.userId !== userId || notice.data.read || !isChatNotice(notice)) continue;
    result.total++;
    const conversation = String(notice.data.conversationId || ""),
      production = String(notice.data.productionId || "");
    if (conversation)
      result.conversations[conversation] = (result.conversations[conversation] || 0) + 1;
    else if (production) result.productions[production] = (result.productions[production] || 0) + 1;
    else result.general++;
  }
  return result;
}
