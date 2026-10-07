import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, route } from "@/platform/http";

afterEach(() => vi.restoreAllMocks());
describe("safe request failure diagnostics", () => {
  it("records useful stack locations without leaking multiline SQL or private values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Failed query with PRIVATE_INPUT");
    error.stack = [
      "Error: Failed query",
      "select secret from private_table",
      "params: PRIVATE_INPUT",
      "    at getChanges (/app/feed.ts:59:35)",
      "    at async GET (/app/route.ts:10:8)",
    ].join("\n");
    const response = await route(async () => {
      throw error;
    });
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("DigitalMask request failed", {
      name: "Error",
      code: "unknown",
      frames: ["    at getChanges (/app/feed.ts:59:35)", "    at async GET (/app/route.ts:10:8)"],
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_INPUT");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private_table");
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE_INPUT");
  });
  it("preserves actionable validation and version conflict errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await route(async () => {
      throw new HttpError(409, "Der Eintrag wurde inzwischen geändert.");
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Der Eintrag wurde inzwischen geändert." });
    expect(log).not.toHaveBeenCalled();
  });
});
