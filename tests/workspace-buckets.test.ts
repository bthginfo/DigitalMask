import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { records } from "@/platform/db/schema";

type Row = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: number;
};
const state = vi.hoisted(() => ({
  rows: [] as Row[],
  queries: [] as { sql: string; params: unknown[] }[],
  cache: new Map<string, unknown>(),
}));
/** Applies the department/kind/year bounds that readScope sends, like PostgreSQL would. */
function run(where: SQL) {
  const query = new PgDialect().sqlToQuery(where);
  state.queries.push(query);
  const dates = query.params.filter(
    (value): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value),
  );
  const [from, to] = dates.map((value) => new Date(value));
  return state.rows
    .filter((row) => query.params.includes(row.kind))
    .filter((row) => !from || (row.createdAt >= from && row.createdAt < to))
    .sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id));
}
vi.mock("@/platform/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        if (table !== records) throw new Error("unexpected table");
        return {
          where: (where: SQL) => ({
            orderBy: async () => run(where),
            groupBy: () => ({
              orderBy: async () =>
                [...new Set(run(where).map((row) => row.createdAt.getUTCFullYear()))]
                  .sort()
                  .map((year) => ({ year })),
            }),
          }),
        };
      },
    }),
  },
}));
vi.mock("@/platform/context", () => ({ scopeTag: (id: string) => `workspace:${id}` }));
vi.mock("@/platform/realtime", () => ({ scheduleLiveChange: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>, key: string[]) => async () => {
    const id = key.join(":");
    if (!state.cache.has(id)) state.cache.set(id, await read());
    return state.cache.get(id);
  },
  revalidateTag: vi.fn(),
}));
import { cacheEntryBytes, readBucketedScope } from "@/modules/records/workspace";

const at = (value: string) => new Date(value);
const row = (id: string, kind: string, created: string, data: Record<string, unknown> = {}) => ({
  id,
  kind,
  data,
  createdAt: at(created),
  updatedAt: at(created),
  createdBy: "author",
  version: 1,
});

beforeEach(() => {
  state.queries.length = 0;
  state.cache.clear();
  state.rows = [
    row("event-2026-b", "events", "2026-03-02T10:00:00Z"),
    row("event-2024", "events", "2024-12-31T23:59:59.999Z"),
    row("leave-2025", "leave", "2025-01-01T00:00:00Z"),
    row("event-2026-a", "events", "2026-03-02T10:00:00Z"),
    row("swap-2025", "shiftSwaps", "2025-06-01T12:00:00Z"),
    row("category-2024", "calendarCategories", "2024-02-01T00:00:00Z"),
    row("task-2026", "tasks", "2026-01-05T00:00:00Z"),
  ];
});

describe("year-bucketed shared snapshots", () => {
  const kinds = ["events", "calendarCategories", "leave", "shiftSwaps"] as const;
  it("returns exactly the rows and order of one unbucketed snapshot", async () => {
    const merged = await readBucketedScope("makeup", "calendar", kinds);
    const expected = state.rows
      .filter((item) => (kinds as readonly string[]).includes(item.kind))
      .sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id))
      .map((item) => item.id);
    expect(merged.map((item) => item.id)).toEqual(expected);
    // Year boundaries are exclusive above and inclusive below, in UTC.
    expect(merged.map((item) => item.id)).toEqual([
      "category-2024",
      "event-2024",
      "leave-2025",
      "swap-2025",
      "event-2026-a",
      "event-2026-b",
    ]);
    expect(merged.every((item) => typeof item.createdAt === "string")).toBe(true);
  });

  it("caches one entry per year next to a small year index", async () => {
    await readBucketedScope("makeup", "calendar", kinds);
    expect([...state.cache.keys()].sort()).toEqual([
      "department-group-v8:makeup:calendar:2024",
      "department-group-v8:makeup:calendar:2025",
      "department-group-v8:makeup:calendar:2026",
      "department-group-years-v1:makeup:calendar",
    ]);
    const reads = state.queries.length;
    await readBucketedScope("makeup", "calendar", kinds);
    expect(state.queries).toHaveLength(reads);
  });

  it("warns once with the stored size when an entry approaches the 2 MB limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.rows.push(
      ...Array.from({ length: 40 }, (_, index) =>
        row(`large-${index}`, "events", "2023-05-01T00:00:00Z", { notes: '"x"'.repeat(15_000) }),
      ),
    );
    await readBucketedScope("makeup", "calendar", kinds);
    state.cache.clear();
    await readBucketedScope("makeup", "calendar", kinds);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatchObject({
      key: "department-group-v8:makeup:calendar:2023",
    });
    expect((warn.mock.calls[0][1] as { bytes: number }).bytes).toBeGreaterThan(1.5 * 1024 * 1024);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("xxx");
    warn.mockRestore();
  });

  it("measures the escaped JSON size that Next.js stores", () => {
    expect(cacheEntryBytes({ a: "b" })).toBe(JSON.stringify({ a: "b" }).length);
    const large = { text: '"'.repeat(1_000_000) };
    expect(cacheEntryBytes(large)).toBe(JSON.stringify(JSON.stringify(large)).length);
  });
});
