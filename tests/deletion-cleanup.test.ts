import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { recordOperations, outbox } from "@/platform/db/schema";

const mock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
import { finalizeRecordDeletion } from "@/modules/changes/cleanup";

function fixture(fileOnly = false) {
  const now = Date.now();
  const operation = {
    id: "receipt",
    recordId: "parent",
    departmentId: "makeup",
    organizationId: "theatre",
    userId: "editor",
    operation: fileOnly ? "updated" : "deleted",
    expiresAt: new Date(now - 1),
    undoneAt: null as Date | null,
    createdAt: new Date(now - 120_000),
  };
  const file = {
    id: "file",
    kind: "files",
    departmentId: "makeup",
    data: {
      recordId: "parent",
      path: "private/original.xlsx",
      ...(fileOnly ? { pendingDeletionOperation: "receipt" } : {}),
    },
  };
  const state = {
    operations: [operation],
    rows: [file] as {
      id: string;
      kind: string;
      departmentId: string;
      data: Record<string, unknown>;
    }[],
    jobs: [] as unknown[],
    sharedDocument: "latest-collaborative-edit",
    deletes: 0,
  };
  if (fileOnly) state.rows.push({ id: "parent", kind: "tasks", departmentId: "makeup", data: {} });
  const dialect = new PgDialect();
  const query = <T>(list: T[]) => ({
    then: Promise.resolve(list).then.bind(Promise.resolve(list)),
    limit: (n: number) => query(list.slice(0, n)),
    for: () => query(list),
    orderBy: () => query(list),
  });
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          const { params } = dialect.sqlToQuery(where);
          if (table === recordOperations)
            return query(
              state.operations
                .filter(
                  (entry) =>
                    params.includes(entry.departmentId) &&
                    (params.includes("receipt")
                      ? params.includes(entry.id)
                      : entry.operation === "deleted"),
                )
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
            );
          if (!params.includes("files"))
            return query(
              state.rows.filter(
                (entry) => params.includes(entry.id) && params.includes(entry.departmentId),
              ),
            );
          return query(
            state.rows.filter(
              (entry) =>
                entry.kind === "files" &&
                params.includes(entry.departmentId) &&
                params.includes(entry.data.recordId) &&
                (!params.includes("receipt") || entry.data.pendingDeletionOperation === "receipt"),
            ),
          );
        },
      }),
    }),
    delete: () => ({
      where: async (where: SQL) => {
        const { params } = dialect.sqlToQuery(where);
        state.rows = state.rows.filter((entry) => !params.includes(entry.id));
        state.deletes++;
        // Models the actual file FK cascade: it happens only at final metadata deletion.
        if (params.includes("file")) state.sharedDocument = "";
      },
    }),
    insert: (table: unknown) => ({
      values: async (jobs: unknown[]) => {
        expect(table).toBe(outbox);
        state.jobs.push(...jobs);
      },
    }),
  };
  mock.transaction.mockImplementation(async (run) => run(tx));
  const payload = {
    recordId: "parent",
    operationId: "receipt",
    ...(fileOnly ? { fileId: "file" } : {}),
  };
  return { state, operation, file, payload };
}

describe("deferred deletion preserves documents during undo", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps files and collaborative edits until the undo window expires", async () => {
    const { state, operation, payload } = fixture();
    operation.expiresAt = new Date(Date.now() + 120_000);
    await finalizeRecordDeletion("makeup", payload);
    expect(state.deletes).toBe(0);
    expect(state.sharedDocument).toBe("latest-collaborative-edit");
    expect(state.jobs).toHaveLength(0);
  });
  it("cannot remove files after a successful undo, even from an older queued cleanup", async () => {
    const { state, operation, payload } = fixture();
    operation.undoneAt = new Date();
    await finalizeRecordDeletion("makeup", payload);
    expect(state.deletes).toBe(0);
    expect(state.sharedDocument).toBe("latest-collaborative-edit");
  });
  it("skips a restored parent and protects a later deletion's undo period", async () => {
    const { state, payload, operation } = fixture();
    state.rows.push({ id: "parent", kind: "tasks", departmentId: "makeup", data: {} });
    await finalizeRecordDeletion("makeup", payload);
    expect(state.deletes).toBe(0);
    state.rows = state.rows.filter((entry) => entry.id !== "parent");
    state.operations.push({
      ...operation,
      id: "later-receipt",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 120_000),
    });
    await finalizeRecordDeletion("makeup", payload);
    expect(state.deletes).toBe(0);
  });
  it("finalizes orphaned metadata and queues the existing protected blob deletion", async () => {
    const { state, payload } = fixture();
    await finalizeRecordDeletion("makeup", payload);
    expect(state.rows).toHaveLength(0);
    expect(state.sharedDocument).toBe("");
    expect(state.jobs).toEqual([
      expect.objectContaining({
        type: "FileDeletionRequestedV1",
        departmentId: "makeup",
        payload: expect.objectContaining({ fileId: "file", path: "private/original.xlsx" }),
      }),
    ]);
  });
  it("removes only the pending standalone attachment and leaves its parent", async () => {
    const { state, payload } = fixture(true);
    await finalizeRecordDeletion("makeup", payload);
    expect(state.rows.map((entry) => entry.id)).toEqual(["parent"]);
    expect(state.jobs).toHaveLength(1);
  });
  it("will not finalize a standalone file whose deletion marker was changed or cleared", async () => {
    const { state, file, payload } = fixture(true);
    delete file.data.pendingDeletionOperation;
    await finalizeRecordDeletion("makeup", payload);
    expect(state.deletes).toBe(0);
    expect(state.sharedDocument).toBe("latest-collaborative-edit");
  });
});
