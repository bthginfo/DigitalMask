import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import type { records } from "@/platform/db/schema";
import type { RecordData } from "@/shared/contracts";

type Row = typeof records.$inferSelect;
const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  emit: vi.fn(),
  invalidate: vi.fn(),
  locks: [] as unknown[][],
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/platform/events", () => ({
  auditChange: vi.fn(),
  emit: mock.emit,
  scheduleEvents: vi.fn(),
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mock.invalidate }));
import { saveRecord } from "@/modules/records/service";

const context = {
  user: { id: "writer", name: "Alex", role: "user" },
  organizationId: "theatre",
  departmentId: "makeup",
} as Context;
const dialect = new PgDialect();
let stored: Row[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  stored = [];
  mock.locks.length = 0;
  const tx = {
    execute: async (query: SQL) => {
      mock.locks.push(dialect.sqlToQuery(query).params);
    },
    select: () => ({
      from: () => ({
        where: (where: SQL) => ({
          limit: async () => {
            const { params } = dialect.sqlToQuery(where);
            return stored.filter(
              (row) =>
                params.includes(row.kind) &&
                params.includes(row.ownerId) &&
                params.includes(String(row.data.idempotencyKey)),
            );
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Row) => ({
        returning: async () => {
          const row = { ...values, createdAt: new Date(), updatedAt: new Date(), version: 1 };
          stored.push(row);
          return [row];
        },
      }),
    }),
  };
  mock.transaction.mockImplementation(async (run: (value: typeof tx) => unknown) => run(tx));
});

describe("idempotent chat messages", () => {
  const send = (data: RecordData) => saveRecord(context, "messages", { text: "Hallo", ...data });

  it("returns the stored message when a send is retried with the same key", async () => {
    const first = await send({ idempotencyKey: "send-1" });
    const retry = await send({ idempotencyKey: "send-1" });
    expect(retry.id).toBe(first.id);
    expect(stored).toHaveLength(1);
    expect(first.data).toMatchObject({ userId: "writer", idempotencyKey: "send-1" });
    // One message, one push, one live signal.
    expect(mock.emit).toHaveBeenCalledTimes(1);
    expect(mock.invalidate).toHaveBeenCalledTimes(1);
    expect(mock.emit.mock.calls[0][2]).toBe("ChatMessageCreatedV1");
    expect(mock.locks.some((params) => String(params[0]).includes(":messages:writer"))).toBe(true);
  });

  it("still creates separate messages without a key or with another key", async () => {
    await send({});
    await send({});
    await send({ idempotencyKey: "send-2" });
    expect(stored).toHaveLength(3);
    expect(stored[0].data).not.toHaveProperty("idempotencyKey");
    expect(mock.emit).toHaveBeenCalledTimes(3);
  });
});
