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

/**
 * Channel to open when Kommunikation is opened without a channel: the most recent channel with
 * unread messages, else the last one this person opened, else the general team channel.
 */
export function defaultChatChoice(
  ordered: { unread: ChatChoice[]; ordinary: ChatChoice[] },
  lastOpenedKey?: string | null,
): ChatChoice | undefined {
  return (
    ordered.unread[0] ??
    (lastOpenedKey
      ? [...ordered.unread, ...ordered.ordinary].find((choice) => choice.key === lastOpenedKey)
      : undefined)
  );
}

export const lastChatKey = (userId: string) => `digitalmask:chat-last:${userId}`;
export function readLastChat(userId: string) {
  try {
    return localStorage.getItem(lastChatKey(userId));
  } catch {
    return null;
  }
}
export function rememberLastChat(userId: string, key: string) {
  try {
    localStorage.setItem(lastChatKey(userId), key);
  } catch {
    // Without device storage the next visit simply opens the default channel.
  }
}
