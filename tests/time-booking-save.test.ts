import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { records } from "@/platform/db/schema";
import type { RecordData } from "@/shared/contracts";

const mock = vi.hoisted(() => ({ transaction: vi.fn(), audit: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/platform/events", () => ({
  auditChange: mock.audit,
  emit: vi.fn(),
  scheduleEvents: vi.fn(),
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mock.invalidate }));
import { saveRecord } from "@/modules/records/service";

const context = (role: "admin" | "user" = "user") =>
  ({ user: { id: "owner", role }, organizationId: "theatre", departmentId: "makeup" }) as Context;
const payload = (): RecordData => ({
  title: "Anwesenheit",
  date: "2026-09-14",
  start: "2026-09-14T07:00:00.000Z",
  end: "2026-09-14T15:00:00.000Z",
  durationSeconds: 27000,
  pauseSeconds: 1800,
  idempotencyKey: "manual:receipt",
});

function fixture() {
  const rows: (typeof records.$inferSelect)[] = [];
  const writes = vi.fn();
  const dialect = new PgDialect();
  const result = (values: Pick<typeof records.$inferSelect, "data">[]) => ({
    then: Promise.resolve(values).then.bind(Promise.resolve(values)),
    limit: (count: number) => result(values.slice(0, count)),
    for: () => result(values),
  });
  const tx = {
    execute: vi.fn(),
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          const { params } = dialect.sqlToQuery(condition);
          if (params.includes("categories"))
            return result([{ data: { key: "other" } }]);
          if (params[0] && rows.some((row) => row.id === params[0]))
            return result(rows.filter((row) => row.id === params[0]));
          if (params.includes("time") && params.includes("manual:receipt"))
            return result(
              rows.filter(
                (row) => row.kind === "time" && row.data.idempotencyKey === "manual:receipt",
              ),
            );
          if (params.includes("attendance") && params.includes("manual:receipt"))
            return result(
              rows.filter(
                (row) => row.kind === "attendance" && row.data.idempotencyKey === "manual:receipt",
              ),
            );
          return result([]);
        },
      }),
    }),
    insert: () => ({
      values: (values: RecordData) => ({
        returning: async () => {
          writes(values);
          const row = {
            ...values,
            createdAt: new Date("2026-10-08T08:00:00Z"),
            version: 1,
          } as typeof records.$inferSelect;
          rows.push(row);
          return [row];
        },
      }),
    }),
    update: () => ({
      set: (values: RecordData) => ({
        where: () => ({
          returning: async () => {
            writes(values);
            rows[0] = { ...rows[0], ...values } as typeof records.$inferSelect;
            return [rows[0]];
          },
        }),
      }),
    }),
  };
  mock.transaction.mockImplementation(async (callback) => callback(tx));
  return { rows, writes };
}

describe("manual attendance receipts in the actual save service", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["user", "admin"] as const)(
    "lets %s save backdated attendance and safely repeat it after a lost response",
    async (role) => {
      const { rows, writes } = fixture();
      const first = await saveRecord(context(role), "attendance", payload());
      const retry = await saveRecord(context(role), "attendance", payload());
      expect(retry.id).toBe(first.id);
      expect(first.data).toMatchObject({
        userId: "owner",
        date: "2026-09-14",
        durationSeconds: 27000,
        dayAllocations: [{ date: "2026-09-14", seconds: 27000 }],
      });
      expect(rows).toHaveLength(1);
      expect(writes).toHaveBeenCalledOnce();
      expect(mock.audit).toHaveBeenCalledOnce();
    },
  );

  it("keeps attendance and work distinct and rejects changing an already committed retry", async () => {
    const { rows, writes } = fixture();
    await saveRecord(context(), "attendance", payload());
    await expect(
      saveRecord(context(), "attendance", { ...payload(), notes: "Nachträgliche Änderung" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(writes).toHaveBeenCalledOnce();
    expect(rows[0].data.notes).toBe("");
    const work = { ...payload(), title: "Tagesdienst", category: "other" };
    const firstWork = await saveRecord(context(), "time", work);
    const workRetry = await saveRecord(context(), "time", work);
    expect(workRetry.id).toBe(firstWork.id);
    expect(rows).toHaveLength(2);
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("allows correcting existing attendance, with administrators retaining the original owner", async () => {
    const { rows } = fixture();
    const first = await saveRecord(context(), "attendance", payload());
    rows[0].ownerId = "colleague";
    rows[0].data.userId = "colleague";
    await expect(
      saveRecord(context(), "attendance", { pauseSeconds: 900 }, first.id, 1),
    ).rejects.toMatchObject({ status: 403 });
    const changed = await saveRecord(
      context("admin"),
      "attendance",
      { pauseSeconds: 900 },
      first.id,
      1,
    );
    expect(changed).toMatchObject({
      version: 2,
      data: { userId: "colleague", pauseSeconds: 900, durationSeconds: 27900 },
    });
  });
});
