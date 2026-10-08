import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiFailure } from "@/shared/client-api";
import {
  clearTimeDraft,
  retainTimeDraft,
  timeDraftQueueKey,
} from "@/modules/time-tracking/client-drafts";

afterEach(() => vi.unstubAllGlobals());

describe("time booking without a reliable response", () => {
  it("explains Safari Load failed without claiming whether the write committed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    await expect(
      api("/api/records/attendance", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({
      status: 0,
      message:
        "Keine Antwort vom Server erhalten. Bitte prüfe deine Verbindung und versuche es erneut.",
    });
  });

  it("does not treat a cut-off successful response as a saved empty record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"id":', { status: 201 })));
    await expect(api("/api/records/time")).rejects.toMatchObject({ status: 0 });
  });

  it("preserves server validation and explicit cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "Diese Zeit überschneidet sich." }), {
            status: 409,
          }),
        ),
    );
    await expect(api("/api/records/time")).rejects.toMatchObject({
      status: 409,
      message: "Diese Zeit überschneidet sich.",
    });
    const controller = new AbortController();
    controller.abort();
    const cancelled = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancelled));
    await expect(api("/api/workspace", { signal: controller.signal })).rejects.toBe(cancelled);
    expect(cancelled).not.toBeInstanceOf(ApiFailure);
  });
});

describe("local time receipts", () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("keeps kinds and people separate and retries the same receipt without extra drafts", () => {
    const attendanceKey = timeDraftQueueKey("attendance", "person");
    const workKey = timeDraftQueueKey("time", "person");
    expect(attendanceKey).not.toBe(workKey);
    expect(attendanceKey).not.toBe(timeDraftQueueKey("attendance", "other"));
    retainTimeDraft(workKey, "manual:work", {
      title: "Perücke",
      date: "2026-09-14",
      durationSeconds: 1800,
    });
    const data = {
      title: "Anwesenheit",
      date: "2026-09-14",
      durationSeconds: 7200,
      pauseSeconds: 0,
    };
    expect(retainTimeDraft(attendanceKey, "manual:receipt", data)).toBe(true);
    expect(retainTimeDraft(attendanceKey, "manual:receipt", data)).toBe(true);
    expect(JSON.parse(storage.get(attendanceKey)!)).toMatchObject([
      { id: "manual:receipt", data: { ...data, idempotencyKey: "manual:receipt" } },
    ]);
    retainTimeDraft(attendanceKey, "manual:other", { ...data, date: "2026-09-15" });
    clearTimeDraft(attendanceKey, "manual:receipt");
    expect(JSON.parse(storage.get(attendanceKey)!)).toHaveLength(1);
    expect(JSON.parse(storage.get(workKey)!)).toHaveLength(1);
  });

  it("does not throw or wipe other entries when storage is full, restricted or malformed", () => {
    const key = timeDraftQueueKey("attendance", "person");
    storage.set(key, "broken-json");
    expect(retainTimeDraft(key, "receipt", {})).toBe(false);
    expect(storage.get(key)).toBe("broken-json");
    vi.stubGlobal("localStorage", {
      getItem: () => "[]",
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
    expect(retainTimeDraft(key, "receipt", {})).toBe(false);
  });
});
