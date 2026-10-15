import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleConnectionTargets, replaceGoogleTarget } from "@/modules/google-calendar/targets";
import { googleRetryAfter, googleRetryDelay } from "@/modules/google-calendar/retry";
import { GoogleCalendarClient, GoogleCalendarError } from "@/modules/google-calendar/provider";
import {
  googleConnectionClient,
  googleTokenPurpose,
  publicGoogleCalendarStatus,
  withGoogleConnection,
  type GoogleConnection,
} from "@/modules/google-calendar/repository";
import { sealGoogleSecret } from "@/modules/google-calendar/crypto";
const mocked = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: { update: mocked.update } }));
const mine = { mode: "mine" as const, memberIds: ["person"] };
const target = (id: string) => ({ calendarId: id, calendarName: id, selection: mine });
const account = (overrides: Partial<GoogleConnection> = {}): GoogleConnection => ({
  id: "account-a",
  userId: "person",
  departmentId: "department",
  googleSubject: "private-subject",
  email: "person@example.test",
  credentials: "private-tokens",
  calendarId: "legacy",
  calendarName: "Legacy",
  selection: mine,
  calendars: null,
  status: "active",
  lastSyncedAt: null,
  lastError: null,
  retryAfter: null,
  retryCount: 0,
  lockToken: "private-lock",
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CALENDAR_ENCRYPTION_KEY", "ab".repeat(32));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("independent Google targets", () => {
  it("keeps legacy IDs and selections without a data rewrite", () => {
    expect(googleConnectionTargets(account())).toEqual([
      { calendarId: "legacy", calendarName: "Legacy", selection: mine },
    ]);
    expect(googleConnectionTargets(account({ calendars: [] }))).toEqual([]);
  });
  it("adds another calendar without replacing the first calendar's selection", () => {
    const first = { ...target("private"), selection: { mode: "team" as const, memberIds: [] } };
    expect(replaceGoogleTarget([first], undefined, target("work"))).toEqual([
      first,
      target("work"),
    ]);
  });
  it("edits one target while preserving all others", () => {
    const targets = [target("first"), target("second")];
    const edited = {
      ...target("first"),
      selection: { mode: "people" as const, memberIds: ["alex"] },
    };
    expect(replaceGoogleTarget(targets, "first", edited)).toEqual([edited, target("second")]);
    expect(targets[0].selection).toEqual(mine);
  });
  it("rejects duplicate destinations and stale target edits", () => {
    const targets = [target("first"), target("second")];
    expect(() => replaceGoogleTarget(targets, "first", target("second"))).toThrow(
      "DuplicateTarget",
    );
    expect(() => replaceGoogleTarget(targets, undefined, target("first"))).toThrow(
      "DuplicateTarget",
    );
    expect(() => replaceGoogleTarget(targets, "removed", target("third"))).toThrow("TargetChanged");
  });
  it("returns all accounts and targets without exposing grants or locks", () => {
    const result = publicGoogleCalendarStatus([
      account(),
      account({ id: "account-b", calendars: [target("one"), target("two")] }),
    ]);
    expect(result.connections.map((row) => [row.id, row.calendars.length])).toEqual([
      ["account-a", 1],
      ["account-b", 2],
    ]);
    const exposed = JSON.stringify(result);
    for (const secret of [
      "private-subject",
      "private-tokens",
      "private-lock",
      "credentials",
      "googleSubject",
    ])
      expect(exposed).not.toContain(secret);
  });
});

describe("Google request pacing and cooldown", () => {
  it("spaces simultaneous requests instead of bursting into one calendar", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ id: "calendar", summary: "Calendar", accessRole: "owner" }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const client = new GoogleCalendarClient("token");
    const operations = Promise.all([client.destination("first"), client.destination("second")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(649);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await operations;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("recognizes operational limits as retryable rather than revoking access", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { errors: [{ reason: "calendarUsageLimitsExceeded" }] } },
            { status: 403, headers: { "Retry-After": "60" } },
          ),
        ),
    );
    await expect(new GoogleCalendarClient("token").destination("calendar")).rejects.toMatchObject({
      code: "quota",
      status: 403,
      retryAfterMs: 60000,
    });
  });
  it("persists a shared account cooldown, keeps credentials and always releases the lease", async () => {
    const row = account();
    const patches: Record<string, unknown>[] = [];
    mocked.update.mockImplementation(() => ({
      set: (value: Record<string, unknown>) => {
        patches.push(value);
        return { where: () => ({ returning: async () => [row] }) };
      },
    }));
    const now = Date.now();
    await expect(
      withGoogleConnection(row.id, async () => {
        throw new GoogleCalendarError("quota", 429, 60000);
      }),
    ).rejects.toMatchObject({ code: "quota" });
    expect(patches).toHaveLength(2);
    expect(patches[1]).toMatchObject({ lockToken: null, lockedUntil: null, retryCount: 1 });
    expect(+(patches[1].retryAfter as Date)).toBeGreaterThanOrEqual(now + 60000);
    expect(patches[1]).not.toHaveProperty("credentials");
    expect(patches[1]).not.toHaveProperty("status");
  });
  it("does not contact Google while an account is cooling, and leaves another account usable", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      googleConnectionClient(account({ retryAfter: new Date(Date.now() + 60000) })),
    ).rejects.toMatchObject({ code: "quota" });
    const other = account({ id: "other", retryAfter: null });
    other.credentials = sealGoogleSecret(
      { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 3600000 },
      googleTokenPurpose(other),
    );
    await expect(googleConnectionClient(other)).resolves.toBeInstanceOf(GoogleCalendarClient);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("makes expired grants reconnectable without deleting credentials", async () => {
    const row = account();
    const patches: Record<string, unknown>[] = [];
    mocked.update.mockImplementation(() => ({
      set: (value: Record<string, unknown>) => {
        patches.push(value);
        return { where: () => ({ returning: async () => [row] }) };
      },
    }));
    await expect(
      withGoogleConnection(row.id, async () => {
        throw new GoogleCalendarError("reconnect", 401);
      }),
    ).rejects.toMatchObject({ code: "reconnect" });
    expect(patches[1]).toMatchObject({
      status: "reconnect",
      retryAfter: null,
      retryCount: 0,
      lockToken: null,
    });
    expect(patches[1]).not.toHaveProperty("credentials");
  });
  it("honors Retry-After and grows retries with bounded jitter", () => {
    expect(googleRetryAfter("60")).toBe(60000);
    expect(googleRetryAfter(new Date(120000).toUTCString(), 60000)).toBe(60000);
    expect(googleRetryAfter("invalid")).toBe(0);
    expect(googleRetryDelay(0, 0, 0)).toBe(15000);
    expect(googleRetryDelay(1, 0, 0)).toBe(30000);
    expect(googleRetryDelay(100, 0, 1)).toBe(303000);
    expect(googleRetryDelay(0, 600000, 0)).toBe(600000);
  });
});
