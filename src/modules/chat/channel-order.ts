import { textValue, type DomainRecord } from "@/shared/contracts";
import { isChatNotice } from "@/modules/notifications/unread";

export interface ChatChoice {
  key: string;
  title: string;
  detail: string;
  kind: "team" | "production" | "direct" | "group";
  conversationId: string;
  productionId: string;
  unread: number;
}
export function chatChoiceKey(conversationId = "", productionId = "") {
  return conversationId
    ? `conversation:${conversationId}`
    : productionId
      ? `production:${productionId}`
      : "general";
}

/** Choices have already passed workspace access, search and archive filters. */
export function unreadFirstChoices(
  choices: ChatChoice[],
  messages: DomainRecord[],
  notifications: DomainRecord[],
  userId: string,
) {
  const available = new Map(choices.map((choice) => [choice.key, choice]));
  const latest = new Map<string, number>();
  const remember = (record: DomainRecord) => {
    const key = chatChoiceKey(
      textValue(record.data.conversationId),
      textValue(record.data.productionId),
    );
    if (!available.has(key)) return;
    const timestamp = Date.parse(record.createdAt);
    if (Number.isFinite(timestamp)) latest.set(key, Math.max(latest.get(key) || 0, timestamp));
  };
  messages.forEach(remember);
  notifications
    .filter((notice) => notice.data.userId === userId && !notice.data.read && isChatNotice(notice))
    .forEach(remember);
  const rows = [...available.values()];
  return {
    unread: rows
      .filter((choice) => choice.unread > 0)
      .sort(
        (a, b) =>
          (latest.get(b.key) || 0) - (latest.get(a.key) || 0) ||
          a.title.localeCompare(b.title, "de", { numeric: true }) ||
          a.key.localeCompare(b.key),
      ),
    ordinary: rows.filter((choice) => choice.unread <= 0),
  };
}
