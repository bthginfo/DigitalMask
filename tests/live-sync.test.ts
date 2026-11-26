import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveTicket, verifyLiveTicket } from "../src/platform/realtime/ticket";
import { connectLiveSync } from "../src/shared/live-sync";

describe("database-free subscription authorization", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-with-enough-entropy-for-ticket-tests");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("binds subscriptions to both department and login cookie", () => {
    const access = createLiveTicket("maske", "better-auth.session_token=one", 1000);
    expect(
      verifyLiveTicket(access.ticket, "better-auth.session_token=one", [access.channel], 2000),
    ).toBe(true);
    expect(
      verifyLiveTicket(access.ticket, "better-auth.session_token=two", [access.channel], 2000),
    ).toBe(false);
    expect(verifyLiveTicket(access.ticket, "", [access.channel], 2000)).toBe(false);
    expect(
      verifyLiveTicket(access.ticket, "better-auth.session_token=one", ["dm:changes:other"], 2000),
    ).toBe(false);
    expect(
      verifyLiveTicket(
        access.ticket,
        "better-auth.session_token=one",
        [access.channel, "default"],
        2000,
      ),
    ).toBe(false);
  });
  it("rejects tampering and expired tickets", () => {
    const access = createLiveTicket("maske", "better-auth.session_token=one", 1000);
    expect(
      verifyLiveTicket(
        `${access.ticket}bad`,
        "better-auth.session_token=one",
        [access.channel],
        2000,
      ),
    ).toBe(false);
    expect(
      verifyLiveTicket(
        access.ticket,
        "better-auth.session_token=one",
        [access.channel],
        access.expiresAt,
      ),
    ).toBe(false);
  });
});

describe("live transport", () => {
  class Source {
    static instances: Source[] = [];
    closed = false;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public url: string) {
      Source.instances.push(this);
    }
    close() {
      this.closed = true;
    }
    send(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
  }
  let doc: EventTarget & { visibilityState: string; hasFocus: () => boolean };
  let win: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers();
    Source.instances = [];
    doc = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => true });
    win = new EventTarget();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("EventSource", Source);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("does not read workspace on heartbeats or normal reconnect, and replays changes", async () => {
    const renew = vi.fn(async () => {}),
      changed = vi.fn(),
      status = vi.fn();
    const stop = connectLiveSync({
      access: () => ({
        channel: "dm:changes:maske",
        ticket: "ticket",
        expiresAt: Date.now() + 3600000,
        cursor: "100",
      }),
      renew,
      changed,
      status,
    });
    const first = Source.instances[0];
    first.send({ type: "connected" });
    first.send({ type: "ping" });
    first.send({ event: "workspace.changed", channel: "dm:changes:maske", id: "101-0" });
    expect(changed).toHaveBeenCalledTimes(1);
    first.send({
      event: "workspace.changed",
      channel: "dm:changes:maske",
      id: "102-0",
      data: { kinds: ["messages", "notifications"] },
    });
    expect(changed).toHaveBeenLastCalledWith(["messages", "notifications"]);
    first.send({ type: "reconnect" });
    await vi.advanceTimersByTimeAsync(60);
    expect(renew).not.toHaveBeenCalled();
    expect(Source.instances[1].url).toContain("102-0");
    expect(status).toHaveBeenCalledWith("live");
    stop();
    expect(Source.instances[1].closed).toBe(true);
  });
  it("disconnects hidden tabs and renews only expired access", async () => {
    let access = {
      channel: "dm:changes:maske",
      ticket: "old",
      expiresAt: Date.now() - 1,
      cursor: "100",
    };
    const renew = vi.fn(async () => {
      access = { ...access, ticket: "fresh", expiresAt: Date.now() + 3600000 };
    });
    const stop = connectLiveSync({
      access: () => access,
      renew,
      changed: vi.fn(),
      status: vi.fn(),
    });
    await Promise.resolve();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(Source.instances[0].url).toContain("fresh");
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(Source.instances[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(600000);
    expect(Source.instances).toHaveLength(1);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(Source.instances).toHaveLength(2);
    expect(renew).toHaveBeenCalledTimes(1);
    stop();
  });
  it("skips this tab's own echoes but still advances the replay cursor", async () => {
    const changed = vi.fn();
    const stop = connectLiveSync({
      access: () => ({
        channel: "dm:changes:maske",
        ticket: "ticket",
        expiresAt: Date.now() + 3600000,
        cursor: "100",
      }),
      renew: vi.fn(async () => {}),
      changed,
      status: vi.fn(),
      origin: "tab-a",
    });
    const source = Source.instances[0];
    source.send({ type: "connected" });
    source.send({
      event: "workspace.changed",
      channel: "dm:changes:maske",
      id: "101-0",
      data: { kinds: ["messages"], origin: "tab-a" },
    });
    expect(changed).not.toHaveBeenCalled();
    source.send({
      event: "workspace.changed",
      channel: "dm:changes:maske",
      id: "102-0",
      data: { kinds: ["messages"], origin: "tab-b" },
    });
    source.send({ event: "workspace.changed", channel: "dm:changes:maske", id: "103-0" });
    expect(changed).toHaveBeenCalledTimes(2);
    source.send({ type: "reconnect" });
    await vi.advanceTimersByTimeAsync(60);
    expect(Source.instances[1].url).toContain("103-0");
    stop();
  });
  it("keeps a visible but unfocused wall display connected", () => {
    doc.hasFocus = () => false;
    const stop = connectLiveSync({
      access: () => ({
        channel: "dm:changes:maske",
        ticket: "ticket",
        expiresAt: Date.now() + 3600000,
        cursor: "100",
      }),
      renew: vi.fn(async () => {}),
      changed: vi.fn(),
      status: vi.fn(),
    });
    expect(Source.instances).toHaveLength(1);
    win.dispatchEvent(new Event("blur"));
    expect(Source.instances[0].closed).toBe(false);
    stop();
  });
  it("repairs a long gap once, and not at all when the renewal already reloaded data", async () => {
    for (const reloadedOnRenew of [false, true]) {
      Source.instances = [];
      let access = {
        channel: "dm:changes:maske",
        ticket: "fresh",
        expiresAt: Date.now() + 3600000,
        cursor: "100",
      };
      const renew = vi.fn(async () => {
        access = { ...access, ticket: "renewed", expiresAt: Date.now() + 3600000 };
        return reloadedOnRenew;
      });
      const changed = vi.fn();
      const stop = connectLiveSync({ access: () => access, renew, changed, status: vi.fn() });
      Source.instances[0].send({ type: "connected" });
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(61 * 60000);
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
      expect(renew).toHaveBeenCalledTimes(1);
      Source.instances.at(-1)!.send({ type: "connected" });
      expect(changed).toHaveBeenCalledTimes(reloadedOnRenew ? 0 : 1);
      if (!reloadedOnRenew) expect(changed).toHaveBeenCalledWith();
      stop();
    }
  });
});
