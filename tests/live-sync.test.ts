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
    first.send({ type: "reconnect" });
    await vi.advanceTimersByTimeAsync(60);
    expect(renew).not.toHaveBeenCalled();
    expect(Source.instances[1].url).toContain("101-0");
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
});
