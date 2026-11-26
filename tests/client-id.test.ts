import { afterEach, describe, expect, it, vi } from "vitest";
import { api, post } from "../src/shared/client-api";
import { clientHeader, clientId } from "../src/shared/client-id";

describe("tab origin header", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("marks state-changing requests with one stable per-tab id and leaves reads untouched", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        return new Response("{}", { status: 200 });
      }),
    );
    await post("/api/records/messages", { data: {} });
    await api("/api/records/messages/1", { method: "DELETE" });
    await api("/api/workspace");
    expect(calls[0].headers[clientHeader]).toBe(clientId());
    expect(calls[1].headers[clientHeader]).toBe(clientId());
    expect(calls[2].headers[clientHeader]).toBeUndefined();
    expect(clientId()).toMatch(/^[0-9a-f-]{20,}$/i);
  });
});
