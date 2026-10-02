import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPushEndpoint, subscriptionSchema } from "../src/modules/notifications/schema";
import { pushPayload, safeNotificationLink } from "../src/modules/notifications/payload";
import { chatUnreadCounts } from "../src/modules/notifications/unread";
import type { DomainRecord } from "../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  send: vi.fn(),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: mocks.invalidate,
}));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
vi.mock("../src/platform/db", () => ({
  db: { select: mocks.select, delete: () => ({ where: mocks.remove }) },
}));
import { deliverNotifications, subscriptionId } from "../src/modules/notifications/service";
const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
const notice = (id: string, userId: string, data = {}) => ({
  id,
  ownerId: userId,
  data,
  role: "user",
});
function selects(...values: unknown[]) {
  mocks.select.mockImplementation(() => {
    const value = values.shift();
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => Promise.resolve(value),
    };
    return query;
  });
}
describe("push consent, boundaries and private payloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VAPID_PUBLIC_KEY", "fixture");
    vi.stubEnv("VAPID_PRIVATE_KEY", "fixture");
    vi.stubEnv("VAPID_SUBJECT", "https://digitalmask.vercel.app");
    mocks.send.mockResolvedValue({ statusCode: 201 });
    mocks.remove.mockResolvedValue([]);
  });
  it("routes chat bubbles per channel and excludes read, other-user and non-chat notices", () => {
    const row = (data: object) => ({ data }) as DomainRecord;
    const counts = chatUnreadCounts(
      [
        row({ type: "ChatMessageCreatedV1", userId: "person", conversationId: "private" }),
        row({ title: "Neue private Nachricht", userId: "person", conversationId: "private" }),
        row({ type: "ChatMessageCreatedV1", userId: "person", productionId: "play" }),
        row({ type: "ChatMessageCreatedV1", userId: "person" }),
        row({ type: "ChatMessageCreatedV1", userId: "person", read: true }),
        row({ type: "ChatMessageCreatedV1", userId: "other" }),
        row({ type: "TaskAssignedV1", userId: "person" }),
      ],
      "person",
    );
    expect(counts).toEqual({
      total: 4,
      general: 1,
      conversations: { private: 2 },
      productions: { play: 1 },
    });
  });
  it("only accepts encrypted subscriptions at known HTTPS browser push services", () => {
    for (const url of [
      endpoint,
      "https://web.push.apple.com/token",
      "https://updates.push.services.mozilla.com/wpush/v2/token",
    ])
      expect(isPushEndpoint(url)).toBe(true);
    for (const url of [
      "http://fcm.googleapis.com/token",
      "https://localhost/token",
      "https://127.0.0.1",
      "https://fcm.googleapis.com.evil.invalid/token",
      "https://user:password@fcm.googleapis.com/token",
      "https://web.push.apple.com:444/token",
    ])
      expect(isPushEndpoint(url)).toBe(false);
    const keys = {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url"),
      auth: Buffer.alloc(16).toString("base64url"),
    };
    expect(subscriptionSchema.parse({ endpoint, keys }).keys).toEqual(keys);
    expect(() =>
      subscriptionSchema.parse({ endpoint, keys: { ...keys, auth: "short" } }),
    ).toThrow();
    expect(subscriptionId(endpoint)).toHaveLength(64);
  });
  it("never includes private message content or external navigation in a lock-screen payload", () => {
    const payload = pushPayload("ChatMessageCreatedV1", "notice-1", "person", 3, {
      body: "Private message",
      title: "Private production",
      link: "https://evil.invalid",
    });
    expect(JSON.stringify(payload)).not.toContain("Private");
    expect(payload).toMatchObject({ url: "/", unreadCount: 3, tag: "notice-1" });
    expect(safeNotificationLink("/?module=chat&conversationId=private")).toBe(
      "/?module=chat&conversationId=private",
    );
    expect(safeNotificationLink("//evil.invalid")).toBe("/");
  });
  it("uses no database reads when push is not configured, and no notice reads without devices", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await deliverNotifications("maske", "ChatMessageCreatedV1", ["new"]);
    expect(mocks.select).not.toHaveBeenCalled();
    vi.stubEnv("VAPID_PRIVATE_KEY", "fixture");
    selects([]);
    await deliverNotifications("maske", "ChatMessageCreatedV1", ["new"]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("checks current private-chat and production membership before delivery and badge counting", async () => {
    const device = {
      id: "device",
      userId: "person",
      departmentId: "maske",
      endpoint,
      keys: {},
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    selects(
      [device],
      [
        {
          notice: notice("new", "person", {
            conversationId: "mine",
            link: "/?module=chat&conversationId=mine",
          }),
          role: "user",
          status: "active",
        },
        {
          notice: notice("removed", "person", { conversationId: "other" }),
          role: "admin",
          status: "active",
        },
        {
          notice: notice("restricted", "person", { productionId: "restricted" }),
          role: "user",
          status: "active",
        },
        { notice: notice("previous", "person"), role: "user", status: "active" },
      ],
      [
        {
          id: "mine",
          kind: "conversations",
          data: { mode: "direct", participantIds: ["person", "sender"] },
        },
        {
          id: "other",
          kind: "conversations",
          data: { mode: "direct", participantIds: ["someone"] },
        },
        { id: "restricted", kind: "productions", data: { memberIds: ["someone"] } },
      ],
    );
    await deliverNotifications("maske", "ChatMessageCreatedV1", ["new", "removed", "restricted"]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toMatchObject({
      userId: "person",
      unreadCount: 2,
      tag: "new",
    });
  });
  it("removes expired devices, but transient provider failures keep the event retryable", async () => {
    const device = {
      id: "device",
      userId: "person",
      departmentId: "maske",
      endpoint,
      keys: {},
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    const rows = [{ notice: notice("new", "person"), role: "user", status: "active" }];
    selects([device], rows);
    mocks.send.mockRejectedValueOnce({ statusCode: 410 });
    await deliverNotifications("maske", "TaskAssignedV1", ["new"]);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalled();
    selects([device], rows);
    mocks.send.mockRejectedValueOnce({ statusCode: 503 });
    await expect(deliverNotifications("maske", "TaskAssignedV1", ["new"])).rejects.toThrow(
      "retried",
    );
  });
});
