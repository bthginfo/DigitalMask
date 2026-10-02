import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const badge = vi.fn(),
    clear = vi.fn(),
    show = vi.fn(),
    navigate = vi.fn(),
    focus = vi.fn(),
    open = vi.fn();
  const self = {
    location: { origin: "https://digitalmask.vercel.app" },
    navigator: { setAppBadge: badge, clearAppBadge: clear },
    addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    registration: { showNotification: show, getNotifications: async () => [] },
    clients: {
      matchAll: async () => [{ url: "https://digitalmask.vercel.app/", navigate, focus }],
      openWindow: open,
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    indexedDB: new IDBFactory(),
    URL,
    Date,
    Number,
    Math,
    Promise,
  });
  const dispatch = async (type: string, data: object) => {
    let work = Promise.resolve();
    listeners.get(type)!({
      ...data,
      waitUntil: (promise: Promise<void>) => {
        work = promise;
      },
    });
    await work;
  };
  return { dispatch, badge, clear, show, navigate, focus, open };
}
describe("installed-app push worker", () => {
  it("receives a background notification, updates badge and opens its app channel", async () => {
    const app = worker();
    await app.dispatch("message", {
      data: { type: "DIGITALMASK_BADGE", userId: "person", count: 0, timestamp: 1 },
      ports: [],
    });
    await app.dispatch("push", {
      data: {
        json: () => ({
          title: "DigitalMask",
          body: "Neue Nachricht",
          userId: "person",
          unreadCount: 2,
          timestamp: 2,
          tag: "one",
          url: "/?module=chat&conversationId=private",
        }),
      },
    });
    expect(app.badge).toHaveBeenCalledWith(2);
    expect(app.show).toHaveBeenCalledTimes(1);
    const options = app.show.mock.calls[0][1];
    await app.dispatch("notificationclick", {
      notification: { data: options.data, close: vi.fn() },
    });
    expect(app.navigate).toHaveBeenCalledWith(
      "https://digitalmask.vercel.app/?module=chat&conversationId=private",
    );
    expect(app.focus).toHaveBeenCalled();
  });
  it("clears the badge after reading and rejects queued push for a logged-out or different account", async () => {
    const app = worker();
    await app.dispatch("message", {
      data: { type: "DIGITALMASK_BADGE", userId: "person", count: 0, timestamp: 20 },
      ports: [],
    });
    await app.dispatch("push", {
      data: { json: () => ({ userId: "person", unreadCount: 5, timestamp: 10 }) },
    });
    expect(app.badge).not.toHaveBeenCalled(); // Delayed push must not restore a read counter.
    await app.dispatch("message", {
      data: { type: "DIGITALMASK_BADGE", userId: null, count: 0 },
      ports: [],
    });
    app.show.mockClear();
    await app.dispatch("push", {
      data: { json: () => ({ userId: "person", unreadCount: 5, timestamp: Date.now() }) },
    });
    expect(app.show).not.toHaveBeenCalled();
    expect(app.clear).toHaveBeenCalled();
  });
  it("keeps notification clicks inside the app even for a malformed external link", async () => {
    const app = worker();
    await app.dispatch("message", {
      data: { type: "DIGITALMASK_BADGE", userId: "person", count: 1 },
      ports: [],
    });
    await app.dispatch("notificationclick", {
      notification: { data: { userId: "person", url: "https://evil.invalid" }, close: vi.fn() },
    });
    expect(app.navigate).toHaveBeenCalledWith("https://digitalmask.vercel.app/");
  });
});
