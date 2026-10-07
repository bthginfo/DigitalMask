import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { DomainRecord, Workspace } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  workspace: vi.fn(),
  cache: new Map<string, unknown>(),
}));
vi.mock("@/platform/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/modules/records/workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@/platform/context", () => ({ scopeTag: (id: string) => `workspace:${id}` }));
vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>, keys: string[]) => async () => {
    const key = JSON.stringify(keys);
    if (mocks.cache.has(key)) return JSON.parse(JSON.stringify(mocks.cache.get(key)));
    const result = await read();
    // A miss returns the original objects; a hit reconstructs JSON, as Next does.
    mocks.cache.set(key, JSON.parse(JSON.stringify(result)));
    return result;
  },
}));
import { getChanges } from "@/modules/changes/feed";

const context = {
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  user: { id: "member", role: "user" },
} as Context;
const stamp = "2026-10-07T08:00:00.000Z";
function record(kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]): DomainRecord {
  return {
    id,
    kind,
    data,
    departmentId: context.departmentId,
    organizationId: context.organizationId,
    createdBy: "member",
    createdAt: stamp,
    updatedAt: stamp,
    version: 2,
  };
}
function operation(after: DomainRecord) {
  return {
    id: `change:${after.id}`,
    kind: after.kind,
    recordId: after.id,
    operation: "updated",
    userId: "member",
    before: { ...after, version: 1, data: { ...after.data, title: "Vorher" } },
    after,
    createdAt: new Date(stamp),
  };
}
function fixture() {
  const workspace = {
    user: context.user,
    department: { id: context.departmentId },
    organization: { id: context.organizationId },
    records: { productions: [] },
  } as unknown as Workspace;
  const rows = [operation(record("tasks", "task", { title: "Jetzt" }))];
  mocks.workspace.mockResolvedValue(workspace);
  mocks.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => rows }) }) }),
  }));
  return { workspace, rows };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.clear();
});

describe("change feed across the persistent JSON cache", () => {
  it("returns the same valid dates on a miss and repeated hits without extra database reads", async () => {
    fixture();
    const first = await getChanges(context);
    expect(first.changes).toHaveLength(1);
    expect(first.changes[0].createdAt).toBe(stamp);
    expect(first.cursor).toBe(stamp);
    expect(await getChanges(context)).toEqual(first);
    expect(await getChanges(context)).toEqual(first);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it("still applies each viewer's permissions after a shared cache hit", async () => {
    const { rows } = fixture();
    rows.push(
      operation(record("attendance", "private-hours", { title: "Privat", userId: "other" })),
    );
    const own = await getChanges(context);
    expect(own.changes.map((entry) => entry.recordId)).toEqual(["task"]);
    mocks.workspace.mockResolvedValueOnce({
      ...(await mocks.workspace()),
      user: { id: "other", role: "user" },
    });
    const other = await getChanges({ ...context, user: { ...context.user, id: "other" } });
    expect(other.changes.map((entry) => entry.recordId)).toEqual(["task", "private-hours"]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it("reloads new changes after invalidation and keeps record-specific caches separate", async () => {
    const { rows } = fixture();
    await getChanges(context);
    rows.push(operation(record("tasks", "new-task", { title: "Neu" })));
    expect((await getChanges(context)).changes).toHaveLength(1);
    mocks.cache.clear();
    expect((await getChanges(context)).changes).toHaveLength(2);
    const single = await getChanges(context, "new-task");
    expect(single.changes.map((entry) => entry.recordId)).toEqual(["new-task"]);
    expect(await getChanges(context, "new-task")).toEqual(single);
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });
});
