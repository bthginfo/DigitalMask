import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { memberships, records } from "@/platform/db/schema";
import { recordKinds } from "@/shared/contracts";

const state = vi.hoisted(() => ({
  select: vi.fn(),
  rows: [] as {
    id: string;
    kind: string;
    data: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    version: number;
  }[],
  cache: new Map<string, { tags: string[]; value: Promise<unknown> }>(),
  queries: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("@/platform/db", () => ({ db: { select: state.select } }));
vi.mock("@/platform/context", () => ({ scopeTag: (id: string) => `workspace:${id}` }));
vi.mock("@/platform/realtime", () => ({ scheduleLiveChange: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache:
    (read: () => Promise<unknown>, key: string[], options: { tags: string[] }) => () => {
      const id = key.join(":");
      if (!state.cache.has(id))
        state.cache.set(id, { tags: options.tags, value: Promise.resolve().then(read) });
      return state.cache.get(id)!.value;
    },
  revalidateTag: (tag: string) => {
    for (const [key, value] of state.cache) if (value.tags.includes(tag)) state.cache.delete(key);
  },
}));
import {
  getWorkspace,
  invalidateNotifications,
  invalidateWorkspace,
} from "@/modules/records/workspace";

const context = {
  user: { id: "one", name: "Example", username: "one", role: "user", status: "active" },
  organizationId: "theatre",
  departmentId: "makeup",
  organizationName: "Theatre",
  departmentName: "Makeup",
} as Context;

beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.queries.length = 0;
  const base = {
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
    createdBy: "one",
    version: 1,
  };
  state.rows = [
    { ...base, id: "event", kind: "events", data: { participantIds: ["one"] } },
    { ...base, id: "actor", kind: "actors", data: { name: "Example Actor" } },
    { ...base, id: "old-notice", kind: "notifications", data: { userId: "one", read: true } },
    { ...base, id: "own-notice", kind: "notifications", data: { userId: "one", read: false } },
    { ...base, id: "other-notice", kind: "notifications", data: { userId: "two", read: false } },
  ];
  state.select.mockImplementation(() => ({
    from: (table: unknown) => {
      if (table === records)
        return {
          where: (where: SQL) => ({
            orderBy: async () => {
              const query = new PgDialect().sqlToQuery(where);
              state.queries.push(query);
              return state.rows.filter(
                (row) =>
                  query.params.includes(row.kind) &&
                  (row.kind !== "notifications" ||
                    (query.params.includes(row.data.userId) && !row.data.read)),
              );
            },
          }),
        };
      if (table === memberships) {
        const team = {
          innerJoin: () => team,
          leftJoin: () => team,
          where: async () => [context.user],
        };
        return team;
      }
      return { where: () => ({ unionAll: async () => [] }) };
    },
  }));
});

describe("database transfer budget", () => {
  it("loads only the caller's unread notices and reuses warmed department snapshots", async () => {
    const first = await getWorkspace(context);
    expect(first.records.notifications.map((row) => row.id)).toEqual(["own-notice"]);
    const reads = state.queries.length;
    await getWorkspace(context);
    expect(state.queries).toHaveLength(reads);
    const notice = state.queries.find((query) => query.params.includes("notifications"))!;
    expect(notice.sql).toContain("owner_id");
    expect(notice.sql).toContain("->>'read'");
    expect(notice.params).toContain("one");
  });

  it("does not reload the calendar or catalog when a chat changes", async () => {
    await getWorkspace(context);
    state.queries.length = 0;
    invalidateWorkspace("makeup", true, ["messages"]);
    const workspace = await getWorkspace(context, ["messages"]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].params).toContain("messages");
    expect(state.queries[0].params).not.toContain("events");
    expect(workspace.records.events).toEqual([]);
  });

  it("invalidates only the recipient's notification cache", async () => {
    const other = { ...context, user: { ...context.user, id: "two" } };
    await getWorkspace(context);
    await getWorkspace(other);
    state.queries.length = 0;
    invalidateNotifications("makeup", ["one"]);
    await getWorkspace(other, ["notifications"]);
    expect(state.queries).toHaveLength(0);
    await getWorkspace(context, ["notifications"]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].params).toContain("one");
  });

  it("supports a broad invalidation for membership changes without retaining shared data", async () => {
    await getWorkspace(context);
    state.queries.length = 0;
    invalidateWorkspace("makeup");
    await getWorkspace(context);
    const kinds = state.queries.flatMap((query) =>
      query.params.filter((param) => recordKinds.includes(param as never)),
    );
    expect(kinds).toContain("events");
    expect(kinds).toContain("actors");
    expect(kinds).not.toContain("timesheets");
  });
});
