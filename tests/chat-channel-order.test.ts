import { describe, expect, it } from "vitest";
import {
  chatChoiceKey,
  unreadFirstChoices,
  type ChatChoice,
} from "../src/modules/chat/channel-order";
import type { DomainRecord } from "../src/shared/contracts";

const choice = (kind: ChatChoice["kind"], id: string, title: string, unread = 1): ChatChoice => ({
  kind,
  key:
    id === "general"
      ? "general"
      : chatChoiceKey(kind === "production" ? "" : id, kind === "production" ? id : ""),
  title,
  detail: "",
  unread,
  conversationId: kind === "production" || id === "general" ? "" : id,
  productionId: kind === "production" ? id : "",
});
const message = (row: ChatChoice, hour: number): DomainRecord => ({
  id: `message-${row.key}`,
  kind: "messages",
  departmentId: "mask",
  organizationId: "theatre",
  version: 1,
  createdBy: "colleague",
  createdAt: `2026-10-02T${String(hour).padStart(2, "0")}:00:00Z`,
  updatedAt: "2026-10-02T18:00:00Z",
  data: { conversationId: row.conversationId, productionId: row.productionId },
});

describe("unread chat order", () => {
  it("moves mixed channel types into one newest-first group without duplicates", () => {
    const rows = [
      choice("team", "general", "Allgemein"),
      choice("team", "team", "Team"),
      choice("production", "play", "Produktion"),
      choice("direct", "direct", "Direkt"),
      choice("group", "group", "Gruppe"),
      choice("team", "read", "Gelesen", 0),
    ];
    const result = unreadFirstChoices(
      rows,
      rows.map((row, index) => message(row, 8 + index)),
      [],
      "me",
    );
    expect(result.unread.map((row) => row.title)).toEqual([
      "Gruppe",
      "Direkt",
      "Produktion",
      "Team",
      "Allgemein",
    ]);
    expect(result.ordinary.map((row) => row.title)).toEqual(["Gelesen"]);
    expect(new Set([...result.unread, ...result.ordinary].map((row) => row.key)).size).toBe(
      rows.length,
    );
  });
  it("never introduces hidden, archived or search-excluded channels from notification data", () => {
    const visible = choice("direct", "visible", "Lena");
    const hidden = choice("direct", "private-hidden", "Private Person");
    const result = unreadFirstChoices(
      [visible],
      [message(hidden, 23), message(visible, 10)],
      [],
      "me",
    );
    expect(result.unread.map((row) => row.key)).toEqual([visible.key]);
    expect(unreadFirstChoices([], [message(hidden, 23)], [], "me").unread).toEqual([]);
  });
  it("reading returns the channel to ordinary choices in their original relative order", () => {
    const read = choice("direct", "direct", "Gelesen", 0),
      unread = choice("group", "group", "Neu"),
      team = choice("team", "team", "Team", 0);
    expect(
      unreadFirstChoices([team, read, unread], [], [], "me").ordinary.map((row) => row.key),
    ).toEqual([team.key, read.key]);
    expect(unreadFirstChoices([team, read, { ...unread, unread: 0 }], [], [], "me").unread).toEqual(
      [],
    );
  });
  it("uses own unread notifications when a message is absent, with deterministic ties", () => {
    const a = choice("team", "a", "Alpha"),
      b = choice("direct", "b", "Beta");
    const notice = {
      ...message(b, 15),
      kind: "notifications",
      data: {
        conversationId: b.conversationId,
        type: "ChatMessageCreatedV1",
        userId: "me",
        read: false,
      },
    } as DomainRecord;
    expect(unreadFirstChoices([a, b], [], [notice], "me").unread.map((row) => row.title)).toEqual([
      "Beta",
      "Alpha",
    ]);
    expect(
      unreadFirstChoices(
        [b, a],
        [],
        [{ ...notice, data: { ...notice.data, userId: "someone-else" } }],
        "me",
      ).unread.map((row) => row.title),
    ).toEqual(["Alpha", "Beta"]);
  });
});
