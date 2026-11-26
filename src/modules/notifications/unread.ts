import type { DomainRecord, Workspace } from "@/shared/contracts";

/** Current unread notices, newest first; reading never changes their creation order. */
export function unreadNotifications(notifications: DomainRecord[], userId: string) {
  return notifications
    .filter((notice) => notice.data.userId === userId && !notice.data.read)
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.id.localeCompare(b.id),
    );
}

/** Notification rows that older releases created for every chat message. */
export function isChatNotice(record: Pick<DomainRecord, "data">) {
  return (
    record.data.type === "ChatMessageCreatedV1" ||
    /^Neue (private Nachricht|Nachricht)/.test(String(record.data.title || ""))
  );
}

/** Per-channel unread chat messages from the workspace's personal `chatUnread` counters. */
export function chatUnreadCounts(chatUnread: Workspace["chatUnread"]) {
  const result = {
    total: 0,
    general: 0,
    conversations: {} as Record<string, number>,
    productions: {} as Record<string, number>,
  };
  for (const [key, value] of Object.entries(chatUnread || {})) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    if (!count) continue;
    if (key === "general") result.general += count;
    else if (key.startsWith("conversation:"))
      result.conversations[key.slice("conversation:".length)] = count;
    else if (key.startsWith("production:"))
      result.productions[key.slice("production:".length)] = count;
    else continue;
    result.total += count;
  }
  return result;
}

/** App icon badge: unread notices plus unread chat messages, without legacy chat rows twice. */
export function appBadgeCount(workspace: Pick<Workspace, "records" | "user" | "chatUnread">) {
  return (
    workspace.records.notifications.filter(
      (notice) =>
        notice.data.userId === workspace.user.id && !notice.data.read && !isChatNotice(notice),
    ).length + chatUnreadCounts(workspace.chatUnread).total
  );
}
