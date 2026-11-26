import type { RecordData } from "@/shared/contracts";

export type PhotoReply = { messageId: string; fileId: string };

export function photoReplyValue(input: unknown): PhotoReply | undefined {
  if (!input || typeof input !== "object" || !("messageId" in input) || !("fileId" in input))
    return undefined;
  return typeof input.messageId === "string" && typeof input.fileId === "string"
    ? { messageId: input.messageId, fileId: input.fileId }
    : undefined;
}

export function matchesPhotoReply(
  reply: PhotoReply,
  destination: RecordData,
  rows: { id: string; kind: string; data: RecordData }[],
) {
  const source = rows.find((row) => row.id === reply.messageId && row.kind === "messages");
  const file = rows.find((row) => row.id === reply.fileId && row.kind === "files");
  return (
    !!source &&
    !!file &&
    (source.data.productionId || "") === (destination.productionId || "") &&
    (source.data.conversationId || "") === (destination.conversationId || "") &&
    file.data.recordKind === "messages" &&
    file.data.recordId === source.id &&
    typeof file.data.mime === "string" &&
    file.data.mime.startsWith("image/")
  );
}
