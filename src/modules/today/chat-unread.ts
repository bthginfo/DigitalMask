import type { DomainRecord, Workspace } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { chatUnreadCounts, isChatNotice } from "@/modules/notifications/unread";

export interface UnreadChannel {
  title: string;
  count: number;
  href: string;
}

/** Unread chat channels for the start screen, most unread first. */
export function chatUnreadSummary(workspace: Workspace) {
  const counts = chatUnreadCounts(workspace.chatUnread);
  const channels: UnreadChannel[] = [];
  if (counts.general)
    channels.push({ title: "Maske · Allgemein", count: counts.general, href: "/?module=chat" });
  for (const [id, count] of Object.entries(counts.productions)) {
    const production = workspace.records.productions.find((item) => item.id === id);
    channels.push({
      title: production ? value(production.data, "title") : "Projektchat",
      count,
      href: `/?module=chat&productionId=${encodeURIComponent(id)}`,
    });
  }
  for (const [id, count] of Object.entries(counts.conversations)) {
    const conversation = workspace.records.conversations.find((item) => item.id === id);
    const title =
      (conversation && value(conversation.data, "title")) ||
      (conversation
        ? (conversation.data.participantIds as string[] | undefined)
            ?.filter((member) => member !== workspace.user.id)
            .map((member) => workspace.members.find((person) => person.id === member)?.name)
            .filter(Boolean)
            .join(", ")
        : "") ||
      "Privater Chat";
    channels.push({
      title,
      count,
      href: `/?module=chat&conversationId=${encodeURIComponent(id)}`,
    });
  }
  channels.sort((a, b) => b.count - a.count);
  return {
    total: counts.total,
    channels,
    isChatNotice: (notice: DomainRecord) => isChatNotice(notice),
  };
}
