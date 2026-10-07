import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { records, recordOperations, recordHistory } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { restoreRow } from "@/modules/changes/snapshots";
import { serialize } from "@/modules/records/repository";
import type { DomainRecord, RecordData } from "@/shared/contracts";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  write: vi.fn(),
  invalidate: vi.fn(),
  schedule: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/modules/records/service", () => ({
  saveRecord: mock.save,
  deleteRecord: mock.remove,
  assertWrite: mock.write,
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mock.invalidate }));
vi.mock("@/platform/events", () => ({ scheduleEvents: mock.schedule, auditChange: vi.fn() }));
vi.mock("@/modules/changes/operations", () => ({ captureRecordOperation: mock.capture }));
import { undoOperation } from "@/modules/changes/undo";

const context = {
  user: { id: "editor", role: "user" },
  departmentId: "makeup",
  organizationId: "theatre",
} as Context;
const snapshot = (
  id = "task",
  data: RecordData = { title: "Vorher", productionId: "" },
): DomainRecord => ({
  id,
  kind: "tasks",
  organizationId: "theatre",
  departmentId: "makeup",
  createdBy: "editor",
  createdAt: "2026-10-07T08:00:00Z",
  updatedAt: "2026-10-07T08:00:00Z",
  version: 1,
  data,
});

function fixture(mode: "updated" | "created" | "deleted" = "updated") {
  const before = snapshot();
  const after = {
    ...snapshot(),
    version: mode === "created" ? 1 : 2,
    data: { title: "Nachher", productionId: "" },
  };
  const operation = {
    id: "receipt",
    userId: "editor",
    departmentId: "makeup",
    organizationId: "theatre",
    recordId: "task",
    kind: "tasks",
    before: mode === "created" ? null : before,
    after: mode === "deleted" ? null : after,
    operation: mode,
    expiresAt: new Date(Date.now() + 120_000),
    undoneAt: null as Date | null,
    undoPayload: {} as Record<string, unknown>,
  };
  const store = {
    operations: [operation],
    rows: mode === "deleted" ? [] : [restoreRow(after)],
    history: [] as unknown[],
  };
  const dialect = new PgDialect();
  const query = <T>(rows: T[]) => ({
    then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    limit: (n: number) => query(rows.slice(0, n)),
    for: () => query(rows),
  });
  const tx = {
    execute: vi.fn(),
    select: () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          const { params } = dialect.sqlToQuery(where);
          if (table === recordOperations)
            return query(
              store.operations.filter(
                (entry) =>
                  params.includes(entry.id) &&
                  params.includes(entry.userId) &&
                  params.includes(entry.departmentId) &&
                  params.includes(entry.organizationId),
              ),
            );
          return query(
            store.rows.filter(
              (row) => params.includes(row.id) && params.includes(row.departmentId),
            ),
          );
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: () => ({
          then: Promise.resolve().then.bind(Promise.resolve()),
          returning: async () => {
            if (table === recordHistory) {
              store.history.push(...(values as unknown[]));
              return [];
            }
            const row = values as typeof records.$inferSelect;
            if (store.rows.some((entry) => entry.id === row.id)) return [];
            store.rows.push(row);
            return [row];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: object) => ({
        where: async (where: SQL) => {
          const { params } = dialect.sqlToQuery(where);
          const entries = table === recordOperations ? store.operations : store.rows;
          const entry = entries.find((entry) => params.includes(entry.id));
          if (entry) Object.assign(entry, values);
        },
      }),
    }),
  };
  mock.transaction.mockImplementation(async (callback) => {
    const previous = structuredClone(store);
    try {
      return await callback(tx);
    } catch (error) {
      Object.assign(store, previous);
      throw error;
    }
  });
  mock.save.mockImplementation(async (_context, _kind, data, id, version, options) => {
    expect(options).toMatchObject({
      transaction: tx,
      replaceData: true,
      undo: true,
      skipCapture: true,
    });
    const row = store.rows.find((row) => row.id === id)!;
    expect(row.version).toBe(version);
    Object.assign(row, { data, version: version + 1 });
    return serialize(row);
  });
  mock.remove.mockImplementation(async (_context, _kind, id, options) => {
    expect(options).toMatchObject({ transaction: tx, skipCapture: true });
    store.rows = store.rows.filter((entry) => entry.id !== id);
  });
  return { store, operation, tx, before, after };
}

describe("undo transaction", () => {
  beforeEach(() => vi.clearAllMocks());
  it("restores updates through the normal validated service and consumes receipts once", async () => {
    const { store, operation } = fixture();
    await undoOperation(context, "receipt");
    expect(store.rows[0].data.title).toBe("Vorher");
    expect(store.rows[0].version).toBe(3);
    expect(operation.undoneAt).toBeInstanceOf(Date);
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    expect(mock.save).toHaveBeenCalledTimes(1);
  });
  it("protects a newer change and does not invalidate after rejection", async () => {
    const { store } = fixture();
    store.rows[0].version++;
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    expect(mock.save).not.toHaveBeenCalled();
    expect(mock.invalidate).not.toHaveBeenCalled();
  });
  it("rejects an expired or someone else's receipt before any mutation", async () => {
    const { operation } = fixture();
    operation.expiresAt = new Date(0);
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    operation.expiresAt = new Date(Date.now() + 120_000);
    operation.userId = "colleague";
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("rechecks current write permissions instead of trusting the old receipt", async () => {
    fixture();
    mock.write.mockImplementationOnce(() => {
      throw new HttpError(403, "Nicht erlaubt");
    });
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 403 });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("uses ordinary dependency protection when undoing a creation", async () => {
    const { store } = fixture("created");
    mock.remove.mockRejectedValueOnce(new HttpError(409, "Wird verwendet"));
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    expect(store.rows).toHaveLength(1);
    expect(store.operations[0].undoneAt).toBeNull();
  });
  it("restores a deletion with its stable ID and validates before commit", async () => {
    const { store } = fixture("deleted");
    await undoOperation(context, "receipt");
    expect(store.rows[0]).toMatchObject({ id: "task", version: 2, data: { title: "Vorher" } });
    expect(mock.capture).toHaveBeenCalledWith(
      expect.anything(),
      context,
      undefined,
      expect.objectContaining({ id: "task" }),
      { operation: "undone", undoable: false },
    );
  });
  it("rolls back a restoration when normal service validation fails", async () => {
    const { store } = fixture("deleted");
    mock.save.mockRejectedValueOnce(new HttpError(409, "Zeitkonflikt"));
    await expect(undoOperation(context, "receipt")).rejects.toMatchObject({ status: 409 });
    expect(store.rows).toHaveLength(0);
    expect(store.operations[0].undoneAt).toBeNull();
    expect(mock.invalidate).not.toHaveBeenCalled();
  });
  it("restores a removed attachment's metadata without replacing its collaborative state", async () => {
    const { store, operation } = fixture();
    const file = {
      ...snapshot("file", {
        title: "",
        productionId: "",
        recordId: "task",
        path: "private/file.xlsx",
      }),
      kind: "files" as const,
    };
    operation.undoPayload.removedFile = file;
    store.rows.push(
      restoreRow({
        ...file,
        version: 2,
        data: { ...file.data, pendingDeletionOperation: "receipt" },
      }),
    );
    await undoOperation(context, "receipt");
    const restored = store.rows.find((entry) => entry.id === "file")!;
    expect(restored.version).toBe(3);
    expect(restored.data.pendingDeletionOperation).toBeUndefined();
    expect(restored.data.path).toBe("private/file.xlsx");
    expect(store.history).toHaveLength(0);
  });
});
