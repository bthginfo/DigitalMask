import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import type { DomainRecord } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  conflict: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  cursorRows: [] as unknown[],
  legacyRows: [] as unknown[],
  invalidateNotifications: vi.fn(),
  invalidateChatReads: vi.fn(),
  assertConversation: vi.fn(),
  findRecord: vi.fn(),
}));
vi.mock("@/platform/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mocks.insert(...args);
      return {
        values: (values: unknown) => ({
          onConflictDoUpdate: (conflict: unknown) => {
            mocks.conflict(values, conflict);
            return { returning: async () => mocks.cursorRows };
          },
        }),
      };
    },
    update: (...args: unknown[]) => {
      mocks.update(...args);
      return {
        set: () => ({
          where: (where: SQL) => {
            mocks.where(where);
            return { returning: async () => mocks.legacyRows };
          },
        }),
      };
    },
  },
}));
vi.mock("@/modules/records/workspace", () => ({
  invalidateNotifications: mocks.invalidateNotifications,
  invalidateChatReads: mocks.invalidateChatReads,
}));
vi.mock("@/modules/chat/permissions", () => ({ assertConversation: mocks.assertConversation }));
vi.mock("@/modules/records/repository", async (original) => ({
  ...(await original<typeof import("@/modules/records/repository")>()),
  findRecord: mocks.findRecord,
}));
import { readChatNotifications } from "@/modules/notifications/read";
import { chatChannelVisible, chatUnreadTotal, visibleChatUnread } from "@/modules/chat/unread";
import { appBadgeCount, chatUnreadCounts } from "@/modules/notifications/unread";

const context = {
  user: { id: "reader", role: "user", name: "Leser" },
  organizationId: "theatre",
  departmentId: "makeup",
} as Context;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cursorRows = [{ lastReadAt: new Date() }];
  mocks.legacyRows = [];
  vi.useRealTimers();
});

describe("chat read cursors", () => {
  it("moves one channel cursor forward without a department-wide signal", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-26T12:00:00.000Z") });
    await expect(
      readChatNotifications(context, {
        conversationId: "direct",
        readAt: "2026-11-26T11:59:00.123Z",
      }),
    ).resolves.toEqual({ read: 0, cursor: true });
    expect(mocks.assertConversation).toHaveBeenCalledWith(context, "direct");
    const [values, conflict] = mocks.conflict.mock.calls[0] as [
      { channelKey: string; lastReadAt: Date; userId: string; departmentId: string },
      { setWhere: SQL; set: { lastReadAt: Date } },
    ];
    expect(values).toMatchObject({
      channelKey: "conversation:direct",
      userId: "reader",
      departmentId: "makeup",
    });
    // Rounded up past the serialized millisecond, so the newest seen message counts as read.
    expect(values.lastReadAt.toISOString()).toBe("2026-11-26T11:59:00.124Z");
    // Never moves backwards.
    expect(new PgDialect().sqlToQuery(conflict.setWhere).sql).toContain("<");
    expect(mocks.invalidateChatReads).toHaveBeenCalledWith("makeup", "reader");
    expect(mocks.invalidateNotifications).not.toHaveBeenCalled();
  });

  it("caps a future read time at now and keys production and general chats", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-26T12:00:00.000Z") });
    mocks.findRecord.mockResolvedValue({ data: { memberIds: [] } });
    await readChatNotifications(context, { productionId: "play", readAt: "2027-01-01T00:00:00Z" });
    await readChatNotifications(context, {});
    const calls = mocks.conflict.mock.calls.map(([values]) => values as Record<string, unknown>);
    expect(calls.map((values) => values.channelKey)).toEqual(["production:play", "general"]);
    expect((calls[0].lastReadAt as Date).toISOString()).toBe("2026-11-26T12:00:00.000Z");
  });

  it("acknowledges legacy chat notification rows of that chat for the reader only", async () => {
    mocks.cursorRows = [];
    mocks.legacyRows = [{ id: "legacy" }];
    await readChatNotifications(context, { productionId: "", conversationId: "" });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(query.sql).toContain("owner_id");
    expect(query.sql).toContain("'notifications'");
    expect(query.params).toContain("reader");
    expect(mocks.invalidateNotifications).toHaveBeenCalledWith("makeup", ["reader"], {
      broadcast: false,
    });
    expect(mocks.invalidateChatReads).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous chats, private chats of others and unknown fields", async () => {
    await expect(
      readChatNotifications(context, { conversationId: "a", productionId: "b" }),
    ).rejects.toMatchObject({ status: 400 });
    mocks.assertConversation.mockRejectedValueOnce(
      Object.assign(new Error("403"), { status: 403 }),
    );
    await expect(readChatNotifications(context, { conversationId: "other" })).rejects.toThrow();
    mocks.findRecord.mockResolvedValue({ data: { memberIds: ["someone"] } });
    await expect(readChatNotifications(context, { productionId: "closed" })).rejects.toMatchObject({
      status: 403,
    });
    await expect(readChatNotifications(context, { userId: "other" })).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("visible unread counters", () => {
  const conversations = new Map([
    ["team-room", { data: { mode: "team" } }],
    ["private", { data: { mode: "group", participantIds: ["reader", "other"] } }],
    ["foreign", { data: { mode: "direct", participantIds: ["a", "b"] } }],
  ]);
  const rows = [
    { userId: "reader", channelKey: "general", unread: 2 },
    { userId: "reader", channelKey: "conversation:team-room", unread: 1 },
    { userId: "reader", channelKey: "conversation:private", unread: 3 },
    { userId: "reader", channelKey: "conversation:foreign", unread: 9 },
    { userId: "reader", channelKey: "production:open", unread: 4 },
    { userId: "reader", channelKey: "production:closed", unread: 5 },
    { userId: "someone", channelKey: "general", unread: 7 },
  ];
  const access = (role: "user" | "superadmin") => ({
    user: { id: "reader", role },
    conversation: (id: string) => conversations.get(id),
    production: (id: string) => id === "open",
  });

  it("keeps the former notification audience per chat", () => {
    expect(visibleChatUnread(rows, access("user"))).toEqual({
      general: 2,
      "conversation:team-room": 1,
      "conversation:private": 3,
      "production:open": 4,
    });
    // Superadmins never received team or production chat notices; private chats stay.
    expect(visibleChatUnread(rows, access("superadmin"))).toEqual({ "conversation:private": 3 });
    expect(chatChannelVisible("unknown", access("user"))).toBe(false);
    expect(chatUnreadTotal(visibleChatUnread(rows, access("user")))).toBe(10);
  });

  it("feeds chat bubbles and the app badge without counting legacy chat rows twice", () => {
    const notice = (data: Record<string, unknown>) =>
      ({ id: String(data.id), data: { userId: "reader", ...data } }) as unknown as DomainRecord;
    const chatUnread = { general: 2, "conversation:private": 1 };
    expect(chatUnreadCounts(chatUnread)).toEqual({
      total: 3,
      general: 2,
      conversations: { private: 1 },
      productions: {},
    });
    expect(
      appBadgeCount({
        user: { id: "reader" } as never,
        chatUnread,
        records: {
          notifications: [
            notice({ id: "task", type: "TaskAssignedV1" }),
            notice({ id: "legacy-chat", type: "ChatMessageCreatedV1" }),
            notice({ id: "old-title", title: "Neue Nachricht · Team" }),
            notice({ id: "read", type: "TaskAssignedV1", read: true }),
          ],
        } as never,
      }),
    ).toBe(4);
  });
});
