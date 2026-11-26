import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emit: vi.fn<(event: string, payload: object) => Promise<void>>(async () => undefined),
  set: vi.fn(async () => "OK"),
  headers: vi.fn(),
  pending: [] as (() => Promise<void>)[],
}));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => mocks.pending.push(task),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/realtime", () => ({
  Realtime: class {
    channel() {
      return { emit: mocks.emit };
    }
  },
}));
vi.mock("@/platform/realtime/redis", () => ({
  liveRedis: () => ({ set: mocks.set }),
  permissionEpochKey: (id: string) => `dm:permissions:${id}`,
}));
import { scheduleLiveChange } from "@/platform/realtime";
import { clientOriginValue } from "@/shared/workspace-sync";

const tab = "4d1c6f5e-0a3b-4c69-9f2e-6f2a0f0b8c11";
async function flush() {
  while (mocks.pending.length) await mocks.pending.shift()!();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending.length = 0;
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://live.example.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture");
  mocks.headers.mockResolvedValue(new Headers({ "x-dm-client": tab }));
});

describe("live echo origin", () => {
  it("adds the writing tab from the request header and keeps the other signal fields", async () => {
    scheduleLiveChange("makeup", ["messages", "messages"]);
    await flush();
    expect(mocks.emit).toHaveBeenCalledWith("workspace.changed", {
      revision: expect.any(String),
      kinds: ["messages"],
      origin: tab,
    });
  });

  it("reads the header in the request scope, before the after() callback runs", async () => {
    scheduleLiveChange("makeup", ["tasks"]);
    expect(mocks.headers).toHaveBeenCalledTimes(1);
    mocks.headers.mockRejectedValue(new Error("outside request scope"));
    await flush();
    expect(mocks.emit.mock.calls[0][1]).toMatchObject({ origin: tab });
  });

  it("omits the origin for background work and malformed or missing headers", async () => {
    scheduleLiveChange("makeup", ["notifications"], { origin: null });
    mocks.headers.mockResolvedValueOnce(new Headers({ "x-dm-client": "bad id with spaces" }));
    scheduleLiveChange("makeup", ["tasks"]);
    mocks.headers.mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    scheduleLiveChange("makeup");
    await flush();
    expect(mocks.headers).toHaveBeenCalledTimes(2);
    for (const [, payload] of mocks.emit.mock.calls) expect(payload).not.toHaveProperty("origin");
    expect(clientOriginValue("x".repeat(65))).toBeUndefined();
    expect(clientOriginValue(tab)).toBe(tab);
  });

  it("renews document capabilities only for permission-relevant changes", async () => {
    scheduleLiveChange("makeup", ["tasks", "events"]);
    scheduleLiveChange("makeup", ["notifications"]);
    await flush();
    expect(mocks.set).not.toHaveBeenCalled();
    for (const kinds of [
      ["productions"],
      ["conversations"],
      ["files", "tasks"],
      undefined,
    ] as const)
      scheduleLiveChange("makeup", kinds);
    scheduleLiveChange("makeup", ["tasks"], { permissions: true });
    await flush();
    expect(mocks.set).toHaveBeenCalledTimes(5);
    expect(mocks.set).toHaveBeenCalledWith("dm:permissions:makeup", expect.any(String));
  });
});
