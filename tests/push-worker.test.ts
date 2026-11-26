import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

function worker(extra: Record<string, unknown> = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const badge = vi.fn(),
    clear = vi.fn(),
    show = vi.fn(),
    navigate = vi.fn(),
    focus = vi.fn(),
    postMessage = vi.fn(),
    open = vi.fn();
  let windows: { url: string; focused?: boolean }[] = [{ url: "https://digitalmask.vercel.app/" }];
  const self = {
    location: { origin: "https://digitalmask.vercel.app" },
    navigator: { setAppBadge: badge, clearAppBadge: clear },
    addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    registration: { showNotification: show, getNotifications: async () => [] },
    clients: {
      matchAll: async () => windows.map((client) => ({ ...client, navigate, focus, postMessage })),
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
    ...extra,
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
  const setWindows = (next: typeof windows) => {
    windows = next;
  };
  return { dispatch, badge, clear, show, navigate, focus, postMessage, open, setWindows };
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
    // The open app navigates itself; client.navigate() is not used (it rejects when uncontrolled).
    expect(app.postMessage).toHaveBeenCalledWith({
      type: "DIGITALMASK_NAVIGATE",
      url: "https://digitalmask.vercel.app/?module=chat&conversationId=private",
    });
    expect(app.navigate).not.toHaveBeenCalled();
    expect(app.focus).toHaveBeenCalled();
    expect(app.open).not.toHaveBeenCalled();
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
    expect(app.postMessage).toHaveBeenCalledWith({
      type: "DIGITALMASK_NAVIGATE",
      url: "https://digitalmask.vercel.app/",
    });
  });
  it("opens a new window when no workspace is open or posting fails", async () => {
    const app = worker();
    app.setWindows([{ url: "https://digitalmask.vercel.app/login" }]);
    await app.dispatch("notificationclick", {
      notification: { data: { userId: "x", url: "/?module=calendar" }, close: vi.fn() },
    });
    expect(app.postMessage).not.toHaveBeenCalled();
    expect(app.open).toHaveBeenCalledWith("https://digitalmask.vercel.app/");
    app.setWindows([{ url: "https://digitalmask.vercel.app/?module=today" }]);
    app.postMessage.mockImplementation(() => {
      throw new Error("detached");
    });
    app.focus.mockRejectedValue(new Error("not allowed"));
    await app.dispatch("notificationclick", {
      notification: { data: { userId: "x", url: "/?module=calendar" }, close: vi.fn() },
    });
    expect(app.open).toHaveBeenCalledTimes(2);
  });
  it("serves hashed build files cache-first and never stores pages, API data or dev output", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: async (request: { url: string }) => stored.get(request.url)?.clone(),
      put: async (request: { url: string }, response: Response) =>
        void stored.set(request.url, response),
      keys: async () => [...stored.keys()].map((url) => ({ url })),
      delete: async (request: { url: string }) => stored.delete(request.url),
    };
    // Same-origin network responses are "basic" in browsers.
    const network = vi.fn(async (request: { url: string }) => {
      const response = new Response("chunk", {
        headers: {
          "cache-control": request.url.includes("dev")
            ? "no-store"
            : "public, max-age=31536000, immutable",
        },
      });
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    });
    const app = worker({ caches: { open: async () => cache }, fetch: network });
    const respond = async (url: string, mode = "no-cors") => {
      let reply: Promise<Response> | undefined;
      await app.dispatch("fetch", {
        request: { url, method: "GET", mode },
        respondWith: (value: Promise<Response>) => (reply = value),
      });
      return reply;
    };
    const chunk = "https://digitalmask.vercel.app/_next/static/chunks/abc123.js";
    await (await respond(chunk))!.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.has(chunk)).toBe(true);
    await respond(chunk);
    expect(network).toHaveBeenCalledTimes(1);
    await respond("https://digitalmask.vercel.app/_next/static/chunks/dev.js");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.size).toBe(1);
    expect(await respond("https://digitalmask.vercel.app/api/workspace")).toBeUndefined();
  });
});
