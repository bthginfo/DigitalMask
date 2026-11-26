import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  drain: vi.fn(async () => ({ processed: 2 })),
  checkpoint: vi.fn(async () => ({ saved: 0, failed: 0 })),
}));
vi.mock("@/platform/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/platform/events", () => ({ drainEvents: mocks.drain }));
vi.mock("@/modules/documents/service", () => ({ checkpointDirtyDocuments: mocks.checkpoint }));
import { retentionBatchSize, retentionRules, runRetention } from "@/platform/retention";
import { GET } from "@/app/api/cron/route";

const dialect = new PgDialect();
const statements = () =>
  mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query as SQL));
const now = new Date("2026-11-26T03:17:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([{ count: 0 }]);
});

describe("daily retention", () => {
  it("removes each kind of expired data with its own age limit", async () => {
    const result = await runRetention(now);
    expect(result).toEqual({
      complete: true,
      deleted: {
        notificationsRead: 0,
        notificationsUnread: 0,
        outboxDone: 0,
        outboxFailed: 0,
        audit: 0,
        rateLimits: 0,
        sessions: 0,
        verifications: 0,
      },
    });
    const queries = statements();
    expect(queries).toHaveLength(retentionRules.length);
    const [read, unread, done, failed, audit, limits, sessions, verifications] = queries;
    expect(read.sql).toContain(`delete from "records"`);
    expect(read.sql).toContain("coalesce(data->>'read','false') = 'true'");
    expect(read.params).toContain("2026-10-27T03:17:00.000Z");
    expect(unread.sql).toContain("<> 'true'");
    expect(unread.params).toContain("2026-05-30T03:17:00.000Z");
    expect(done.sql).toContain(`delete from "outbox"`);
    expect(done.sql).toContain("status = 'done'");
    expect(done.params).toContain("2026-11-12T03:17:00.000Z");
    expect(failed.sql).toContain("status = 'failed'");
    expect(failed.params).toContain("2026-08-28T03:17:00.000Z");
    expect(audit.sql).toContain(`delete from "audit"`);
    expect(audit.params).toContain("2025-11-26T03:17:00.000Z");
    expect(limits.sql).toContain(`delete from "auth_rate_limit"`);
    expect(limits.params).toContain(now.getTime() - 86_400_000);
    expect(sessions.sql).toContain(`delete from "app_session"`);
    expect(verifications.sql).toContain(`delete from "app_verification"`);
    for (const query of queries) {
      expect(query.sql).toContain("limit $");
      expect(query.params).toContain(retentionBatchSize);
    }
    // Pending outbox work and unexpired sessions are never part of a rule.
    expect(done.sql).not.toContain("pending");
  });

  it("deletes in bounded batches until a batch is not full", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ count: retentionBatchSize }])
      .mockResolvedValueOnce([{ count: retentionBatchSize }])
      .mockResolvedValueOnce([{ count: 7 }]);
    const result = await runRetention(now);
    expect(result.deleted.notificationsRead).toBe(2 * retentionBatchSize + 7);
    expect(result.complete).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(retentionRules.length + 2);
  });

  it("stops at the per-rule cap and at the deadline, leaving the rest for the next run", async () => {
    mocks.execute.mockResolvedValue([{ count: retentionBatchSize }]);
    const capped = await runRetention(now);
    expect(capped.complete).toBe(false);
    expect(capped.deleted.audit).toBe(20 * retentionBatchSize);
    mocks.execute.mockClear();
    const late = await runRetention(now, Date.now() - 1);
    expect(late.complete).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe("cron endpoint", () => {
  const request = (authorization?: string) =>
    new Request("https://digitalmask.example/api/cron", {
      headers: authorization ? { authorization } : {},
    });
  it("compares the secret in constant time and reports retention counts", async () => {
    vi.stubEnv("CRON_SECRET", "fixture-secret");
    for (const header of [undefined, "Bearer wrong", "Bearer fixture-secre", "fixture-secret"])
      expect((await GET(request(header))).status).toBe(401);
    expect(mocks.drain).not.toHaveBeenCalled();
    const response = await GET(request("Bearer fixture-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      processed: 2,
      documents: { saved: 0, failed: 0 },
      retention: { complete: true, deleted: { outboxDone: 0, sessions: 0 } },
    });
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
  });
});
