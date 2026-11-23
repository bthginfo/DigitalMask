import type { DomainRecord } from "@/shared/contracts";

export type ChatScope = { productionId: string; conversationId: string };
export const workspaceMessageLimit = 300;
export function messageInChat(message: DomainRecord, scope: ChatScope) {
  return (
    (message.data.conversationId || "") === scope.conversationId &&
    (message.data.productionId || "") === scope.productionId
  );
}
export type ChatMediaItem = { file: DomainRecord; messageId: string; sentAt: string };
export function chatMediaItems(messages: DomainRecord[], files: DomainRecord[], scope: ChatScope) {
  const parents = new Map(
    messages
      .filter((message) => messageInChat(message, scope))
      .map((message) => [message.id, message]),
  );
  const items: ChatMediaItem[] = [];
  for (const file of files) {
    if (file.data.recordKind !== "messages" || file.data.pendingDeletionOperation) continue;
    const message = parents.get(String(file.data.recordId));
    if (message) items.push({ file, messageId: message.id, sentAt: message.createdAt });
  }
  return items.sort(
    (a, b) => b.sentAt.localeCompare(a.sentAt) || b.file.id.localeCompare(a.file.id),
  );
}
export const mediaBatchSize = 12;
export function chatMediaPage(items: ChatMediaItem[], before: string, beforeId: string) {
  const remaining = before
    ? items.filter(
        (item) =>
          item.sentAt < before ||
          (item.sentAt === before && item.file.id.localeCompare(beforeId) < 0),
      )
    : items;
  return { items: remaining.slice(0, mediaBatchSize), more: remaining.length > mediaBatchSize };
}
