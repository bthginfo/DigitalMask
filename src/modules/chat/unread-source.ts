import type { Workspace } from "@/shared/contracts";
import { chatUnreadCounts } from "@/modules/notifications/unread";

export type ChatUnread = ReturnType<typeof chatUnreadCounts>;

/**
 * The one place chat views read unread counts from (navigation badges, channel list and the
 * default channel). The data source behind it can be replaced without touching the views.
 */
export function chatUnread(workspace: Workspace): ChatUnread {
  return chatUnreadCounts(workspace.records.notifications, workspace.user.id);
}

/** Accessible suffix such as " · 3 ungelesene Nachrichten". */
export function unreadLabel(count: number) {
  return count ? ` · ${count} ungelesene ${count === 1 ? "Nachricht" : "Nachrichten"}` : "";
}
