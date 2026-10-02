import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { SharedDocument } from "../src/modules/documents/client/shared-document";
const createdPersistence = vi.hoisted(() => vi.fn());
vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    whenSynced = Promise.resolve();
    constructor(name: string) {
      createdPersistence(name);
    }
    destroy() {
      return Promise.resolve();
    }
  },
}));
let clients: SharedDocument[] = [];
const encode = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const session = (doc: Y.Doc) => ({
  state: encode(doc),
  revision: 0,
  fileId: "file",
  name: "Plan.docx",
  format: "text",
  metadata: { sourceName: "Plan.docx", warnings: [] },
  canEdit: true,
  access: {
    ticket: "authorized",
    channel: "document:file",
    cursor: "1",
    expiresAt: Date.now() + 1800000,
  },
});
function client() {
  const value = new SharedDocument("file", "alex");
  clients.push(value);
  return value;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => false }),
  );
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
    },
  );
  createdPersistence.mockClear();
});
afterEach(() => {
  clients.forEach((value) => value.destroy());
  clients = [];
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared document client durability", () => {
  it("checkpoints continuous edits within 15 minutes and idle edits after 60 seconds", async () => {
    const server = new Y.Doc(),
      local = client();
    let checkpoints = 0,
      revision = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/session")) return json(session(server));
        if (url.endsWith("/checkpoint")) {
          checkpoints++;
          return json({ revision });
        }
        const data = JSON.parse(options.body as string);
        Y.applyUpdate(server, Buffer.from(data.update, "base64"));
        return json({ state: encode(server), revision: ++revision });
      }),
    );
    await local.start();
    for (let edit = 0; edit < 300; edit++) {
      local.doc.getMap("body-test").set("editing", String(edit));
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(checkpoints).toBe(1);
    local.doc.getMap("body-test").set("idle", "final edit");
    await vi.advanceTimersByTimeAsync(59999);
    expect(checkpoints).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(checkpoints).toBe(2);
    server.destroy();
  });
  it("merges concurrent peer changes from an own ack before advancing the read revision", async () => {
    const server = new Y.Doc();
    server.getMap("body-test").set("original", "text");
    const local = client();
    const sent: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/session")) return json(session(server));
        const data = JSON.parse(options.body as string);
        sent.push(data);
        Y.applyUpdate(server, Buffer.from(data.update, "base64"));
        server.getMap("body-test").set("peer", "Lena");
        return json({ state: encode(server), revision: sent.length });
      }),
    );
    await local.start();
    local.doc.getMap("body-test").set("own", "Alex");
    await local.flush();
    expect(local.doc.getMap("body-test").toJSON()).toEqual({
      original: "text",
      own: "Alex",
      peer: "Lena",
    });
    expect(local.getSnapshot()).toMatchObject({ status: "saved", pending: false });
    local.doc.getMap("body-test").set("next", "change");
    await local.flush();
    expect(sent.map((item) => item.sinceRevision)).toEqual([0, 1]);
    server.destroy();
  });

  it("retains a rejected batch, checkpoints once, and retries the same shared edit", async () => {
    const server = new Y.Doc(),
      local = client();
    let checkpoints = 0,
      attempts = 0;
    const updates: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/session")) return json(session(server));
        if (url.endsWith("/checkpoint")) {
          checkpoints++;
          return json({ revision: 0 });
        }
        const data = JSON.parse(options.body as string);
        updates.push(data.update);
        if (!attempts++)
          return json({ error: "Checkpoint", code: "document_checkpoint_required" }, 409);
        Y.applyUpdate(server, Buffer.from(data.update, "base64"));
        return json({ state: encode(server), revision: 1 });
      }),
    );
    await local.start();
    local.doc.getMap("body-test").set("own", "Retained");
    await local.flush();
    expect(checkpoints).toBe(1);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toBe(updates[1]);
    expect(server.getMap("body-test").get("own")).toBe("Retained");
    expect(local.getSnapshot()).toMatchObject({ status: "saved", pending: false });
    server.destroy();
  });

  it("does not restore another local document before authorization and never claims a rejected edit is saved", async () => {
    const denied = client();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Access denied" }, 403)),
    );
    await denied.start();
    expect(createdPersistence).not.toHaveBeenCalled();
    expect(denied.getSnapshot().status).toBe("forbidden");
    const server = new Y.Doc(),
      allowed = client();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/session") ? json(session(server)) : json({ error: "Unavailable" }, 503),
      ),
    );
    await allowed.start();
    allowed.doc.getMap("body-test").set("own", "Unsaved");
    await expect(allowed.flush()).rejects.toThrow("Unavailable");
    expect(allowed.getSnapshot()).toMatchObject({
      status: "error",
      pending: true,
      localReady: true,
    });
    expect(allowed.doc.getMap("body-test").get("own")).toBe("Unsaved");
    server.destroy();
  });
});
