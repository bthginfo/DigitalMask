import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleEvent,
  googleEventFingerprint,
  matchesGoogleSelection,
} from "@/modules/google-calendar/presentation";
import { openGoogleSecret, sealGoogleSecret } from "@/modules/google-calendar/crypto";
import {
  exchangeGoogleCode,
  GoogleCalendarClient,
  GoogleCalendarError,
  refreshGoogleTokens,
} from "@/modules/google-calendar/provider";
import {
  newGoogleEventId,
  removeMappedGoogleEvent,
  upsertMappedGoogleEvent,
  type GoogleEventMapping,
} from "@/modules/google-calendar/reconcile";
import type { DomainRecord } from "@/shared/contracts";

const event = (data: Record<string, unknown> = {}): DomainRecord => ({
  id: "source",
  kind: "events",
  organizationId: "org",
  departmentId: "department",
  createdBy: "creator",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  version: 1,
  data: {
    start: "2026-10-24T17:00:00Z",
    end: "2026-10-24T19:00:00Z",
    participantIds: ["lena"],
    title: "Probe",
    category: "rehearsal",
    ...data,
  },
});
const references = { productions: [], categories: [], members: [{ id: "lena", name: "Lena" }] };
const mapping = (overrides: Partial<GoogleEventMapping> = {}): GoogleEventMapping => ({
  id: "mapping",
  connectionId: "connection",
  recordId: "source",
  calendarId: "destination",
  googleEventId: "dm12345",
  fingerprint: "",
  etag: null,
  ...overrides,
});
const managed = {
  id: "dm12345",
  etag: '"etag"',
  extendedProperties: { private: { digitalmask: "connection", source: "source" } },
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_CALENDAR_ENCRYPTION_KEY", "ab".repeat(32));
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "example-client");
  vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "example-secret");
  vi.stubEnv("APP_URL", "https://digitalmask.example");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google credentials", () => {
  it("encrypts tokens with a unique nonce and binds them to their user and department", () => {
    const tokens = { accessToken: "access", refreshToken: "refresh", expiresAt: 123 };
    const encrypted = sealGoogleSecret(tokens, "department:user");
    expect(encrypted).not.toContain("refresh");
    expect(sealGoogleSecret(tokens, "department:user")).not.toBe(encrypted);
    expect(openGoogleSecret(encrypted, "department:user")).toEqual(tokens);
    expect(() => openGoogleSecret(encrypted, "department:other-user")).toThrow();
  });
  it("rejects tampering and the wrong key", () => {
    const encrypted = sealGoogleSecret({ value: "secret" }, "tokens");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => openGoogleSecret(parts.join("."), "tokens")).toThrow();
    vi.stubEnv("GOOGLE_CALENDAR_ENCRYPTION_KEY", "cd".repeat(32));
    expect(() => openGoogleSecret(encrypted, "tokens")).toThrow();
  });
  it("exchanges codes with PKCE, offline tokens and the fixed redirect URI", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          scope:
            "openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        }),
      );
    vi.stubGlobal("fetch", mock);
    expect((await exchangeGoogleCode("code", "verifier")).refreshToken).toBe("refresh");
    const options = mock.mock.calls[0][1];
    expect(options.body.get("code_verifier")).toBe("verifier");
    expect(options.body.get("redirect_uri")).toBe(
      "https://digitalmask.example/api/integrations/google-calendar/callback",
    );
    expect(options.body.get("client_secret")).toBe("example-secret");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
  });
  it("rejects partial Calendar permission grants", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ access_token: "access", expires_in: 3600, scope: "openid email" }),
        ),
    );
    await expect(exchangeGoogleCode("code", "verifier")).rejects.toMatchObject({
      code: "permission",
    });
  });
  it("preserves a refresh token if Google does not rotate it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ access_token: "new", expires_in: 3600 })),
    );
    const result = await refreshGoogleTokens({
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: 0,
    });
    expect(result.accessToken).toBe("new");
    expect(result.refreshToken).toBe("refresh");
  });
  it("turns revoked grants into a reconnect requirement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "invalid_grant", error_description: "private provider detail" },
            { status: 400 },
          ),
        ),
    );
    await expect(
      refreshGoogleTokens({ accessToken: "old", refreshToken: "revoked", expiresAt: 0 }),
    ).rejects.toMatchObject({ code: "reconnect", message: "GoogleCalendar:reconnect" });
  });
});

describe("Google calendar selection and dates", () => {
  it("uses person selection, including shared production events without production membership", () => {
    const productionEvent = event({ productionId: "restricted-production" });
    expect(matchesGoogleSelection(productionEvent, { mode: "mine", memberIds: [] }, "other")).toBe(
      false,
    );
    expect(matchesGoogleSelection(productionEvent, { mode: "mine", memberIds: [] }, "lena")).toBe(
      true,
    );
    expect(
      matchesGoogleSelection(productionEvent, { mode: "people", memberIds: ["lena"] }, "other"),
    ).toBe(true);
    expect(matchesGoogleSelection(productionEvent, { mode: "team", memberIds: [] }, "other")).toBe(
      true,
    );
    expect(
      matchesGoogleSelection(productionEvent, { mode: "people", memberIds: [] }, "other"),
    ).toBe(false);
    expect(
      matchesGoogleSelection(
        productionEvent,
        { mode: "team", memberIds: [], productionId: "different" },
        "other",
      ),
    ).toBe(false);
    expect(
      matchesGoogleSelection(
        productionEvent,
        { mode: "team", memberIds: [], category: "performance" },
        "other",
      ),
    ).toBe(false);
  });
  it("keeps Berlin recurrence clocks across DST and includes exceptions", () => {
    const body = buildGoogleEvent(
      event({ recurrence: "weekly", until: "2026-11-30", exceptions: ["2026-10-31"] }),
      "connection",
      references,
    );
    expect(body.start).toEqual({ dateTime: "2026-10-24T17:00:00.000Z", timeZone: "Europe/Berlin" });
    expect(body.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;UNTIL=20261130T225959Z",
      "EXDATE;TZID=Europe/Berlin:20261031T190000",
    ]);
  });
  it("uses exclusive local end dates for all-day events across DST", () => {
    const body = buildGoogleEvent(
      event({
        category: "vacation",
        allDay: true,
        start: "2026-10-24T22:00:00Z",
        end: "2026-10-26T23:00:00Z",
        recurrence: "daily",
        until: "2026-11-01",
        exceptions: ["2026-10-27"],
      }),
      "connection",
      references,
    );
    expect(body.start).toEqual({ date: "2026-10-25" });
    expect(body.end).toEqual({ date: "2026-10-27" });
    expect(body.recurrence).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261101",
      "EXDATE;VALUE=DATE:20261027",
    ]);
  });
  it("escapes notes and never invites participants or enables Google reminders", () => {
    const body = buildGoogleEvent(
      event({ description: '<a href="evil">Notiz</a>' }),
      "connection",
      references,
    );
    expect(body.description).toContain("&lt;a href=&quot;evil&quot;&gt;Notiz&lt;/a&gt;");
    expect(body.description).toContain("Lena");
    expect(body).not.toHaveProperty("attendees");
    expect(body.reminders).toEqual({ useDefault: false });
    expect(body.visibility).toBe("private");
  });
  it("fingerprints only Google-visible fields, avoiding writes after unrelated version changes", () => {
    const original = event();
    const body = buildGoogleEvent(original, "connection", references);
    expect(googleEventFingerprint(body)).toBe(
      googleEventFingerprint(
        buildGoogleEvent({ ...original, version: 2 }, "connection", references),
      ),
    );
    expect(googleEventFingerprint(body)).not.toBe(
      googleEventFingerprint(
        buildGoogleEvent(event({ title: "Geändert" }), "connection", references),
      ),
    );
  });
});

describe("Mapped Google events", () => {
  const body = () => buildGoogleEvent(event(), "connection", references);
  it("creates only a preassigned, retry-safe event ID", async () => {
    const client = { insert: vi.fn().mockResolvedValue(managed), event: vi.fn(), update: vi.fn() };
    await upsertMappedGoogleEvent(client, mapping(), body(), vi.fn());
    expect(client.insert).toHaveBeenCalledWith("destination", "dm12345", body());
    expect(client.event).not.toHaveBeenCalled();
    expect(newGoogleEventId()).toMatch(/^[a-v0-9]{5,1024}$/);
  });
  it("recovers a lost insert response without creating a second Google event", async () => {
    const client = {
      insert: vi.fn().mockRejectedValue(new GoogleCalendarError("conflict", 409)),
      event: vi.fn().mockResolvedValue(managed),
      update: vi.fn().mockResolvedValue(managed),
    };
    await upsertMappedGoogleEvent(client, mapping(), body(), vi.fn());
    expect(client.insert).toHaveBeenCalledTimes(1);
    expect(client.update).toHaveBeenCalledWith("destination", "dm12345", body(), '"etag"');
  });
  it("never changes or deletes a Google event without its own matching marker", async () => {
    const foreign = {
      id: "dm12345",
      etag: '"etag"',
      extendedProperties: { private: { digitalmask: "different", source: "source" } },
    };
    const client = {
      insert: vi.fn(),
      event: vi.fn().mockResolvedValue(foreign),
      update: vi.fn(),
      remove: vi.fn(),
    };
    await expect(
      upsertMappedGoogleEvent(client, mapping({ fingerprint: "old" }), body(), vi.fn()),
    ).rejects.toMatchObject({ code: "ownership" });
    await expect(removeMappedGoogleEvent(client, mapping())).rejects.toMatchObject({
      code: "ownership",
    });
    expect(client.update).not.toHaveBeenCalled();
    expect(client.remove).not.toHaveBeenCalled();
  });
  it("persists a new ID before recreating an event deleted in Google", async () => {
    const order: string[] = [];
    const replace = vi.fn(async (id: string) => {
      expect(id).toMatch(/^dm[a-f0-9]+$/);
      order.push("persist");
    });
    const client = {
      insert: vi.fn(async (_calendar: string, id: string) => {
        order.push("insert");
        return { ...managed, id };
      }),
      event: vi.fn().mockRejectedValue(new GoogleCalendarError("not-found", 410)),
      update: vi.fn(),
    };
    const remote = await upsertMappedGoogleEvent(
      client,
      mapping({ fingerprint: "old" }),
      body(),
      replace,
    );
    expect(order).toEqual(["persist", "insert"]);
    expect(remote.id).toBe(replace.mock.calls[0][0]);
    expect(remote.id).not.toBe("dm12345");
  });
  it("deletes only the mapped calendar copy with an ETag precondition", async () => {
    const client = {
      event: vi.fn().mockResolvedValue(managed),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    await removeMappedGoogleEvent(client, mapping());
    expect(client.remove).toHaveBeenCalledWith("destination", "dm12345", '"etag"');
  });
  it("treats an already removed event as a successful deletion", async () => {
    const client = {
      event: vi.fn().mockRejectedValue(new GoogleCalendarError("not-found", 404)),
      remove: vi.fn(),
    };
    await expect(removeMappedGoogleEvent(client, mapping())).resolves.toBeUndefined();
    expect(client.remove).not.toHaveBeenCalled();
  });
  it("leaves failed or concurrently modified Google entries retryable", async () => {
    const client = {
      event: vi.fn().mockResolvedValue(managed),
      remove: vi.fn().mockRejectedValue(new GoogleCalendarError("changed", 412)),
    };
    await expect(removeMappedGoogleEvent(client, mapping())).rejects.toMatchObject({
      code: "changed",
    });
  });
});

describe("Google API permissions", () => {
  it("lists only calendars the person owns", async () => {
    const mock = vi.fn().mockResolvedValue(
      Response.json({
        items: [
          { id: "own", summary: "Mein Kalender", accessRole: "owner", primary: true },
          { id: "shared", summary: "Geteilt", accessRole: "writer" },
        ],
      }),
    );
    vi.stubGlobal("fetch", mock);
    expect(await new GoogleCalendarClient("access").calendars()).toEqual([
      { id: "own", name: "Mein Kalender", primary: true },
    ]);
    expect(mock.mock.calls[0][0]).toContain("minAccessRole=owner");
  });
  it("rejects a destination with only shared write access", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: "shared", summary: "Geteilt", accessRole: "writer" }),
        ),
    );
    await expect(new GoogleCalendarClient("access").destination("shared")).rejects.toMatchObject({
      code: "permission",
    });
  });
  it("recognizes Google rate limits for queue backoff", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 }),
        ),
    );
    await expect(new GoogleCalendarClient("access").calendars()).rejects.toMatchObject({
      code: "quota",
    });
  });
});
