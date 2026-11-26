import { describe, expect, it } from "vitest";
import { matchesPhotoReply, photoReplyValue } from "@/modules/chat/photo-reply";
import { validateRecord } from "@/modules/records/schemas";

describe("photo replies", () => {
  const reply = { messageId: "m", fileId: "f" };
  const file = {
    id: "f",
    kind: "files",
    data: { mime: "image/webp", recordKind: "messages", recordId: "m" },
  };
  const message = { id: "m", kind: "messages", data: { conversationId: "private" } };
  it("preserves a precise image reference and accepts existing messages", () => {
    expect(
      photoReplyValue(
        validateRecord("messages", { text: "Antwort", photoReply: reply }).photoReply,
      ),
    ).toEqual(reply);
    expect(
      photoReplyValue(validateRecord("messages", { text: "Früher" }).photoReply),
    ).toBeUndefined();
    expect(matchesPhotoReply(reply, message.data, [message, file])).toBe(true);
  });
  it("requires an existing image from the same message and channel", () => {
    for (const destination of [{}, { conversationId: "other" }, { productionId: "production" }])
      expect(matchesPhotoReply(reply, destination, [message, file])).toBe(false);
    for (const changes of [
      { mime: "application/pdf" },
      { recordKind: "looks" },
      { recordId: "another" },
    ])
      expect(
        matchesPhotoReply(reply, message.data, [
          message,
          { ...file, data: { ...file.data, ...changes } },
        ]),
      ).toBe(false);
    expect(matchesPhotoReply(reply, message.data, [file])).toBe(false);
    expect(matchesPhotoReply(reply, message.data, [message])).toBe(false);
  });
});
