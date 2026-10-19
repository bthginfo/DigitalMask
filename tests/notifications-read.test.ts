import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { update: mocks.update } }));
vi.mock("@/modules/records/workspace", () => ({ invalidateNotifications: mocks.invalidate }));
vi.mock("@/modules/chat/permissions", () => ({ assertConversation: vi.fn() }));
vi.mock("@/modules/records/repository", () => ({ findRecord: vi.fn(), projectVisible: vi.fn() }));
import { readNotifications } from "@/modules/notifications/read";

const context = {
  user: { id: "self", role: "user" },
  organizationId: "theatre",
  departmentId: "makeup",
} as Context;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReturnValue({ set: () => ({ where: mocks.where }) });
  mocks.where.mockReturnValue({ returning: mocks.returning });
});

describe("notification snapshot acknowledgements", () => {
  it("updates a deduplicated snapshot in one scoped write, without touching later arrivals", async () => {
    mocks.returning.mockResolvedValue([{ id: "first" }, { id: "second" }]);
    await expect(
      readNotifications(context, { ids: ["first", "second", "first"] }),
    ).resolves.toEqual({ read: 2 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0] as SQL);
    expect(query.params).toEqual([
      "theatre",
      "makeup",
      "notifications",
      "self",
      "self",
      "first",
      "second",
    ]);
    for (const field of ["organization_id", "department_id", "kind", "owner_id"])
      expect(query.sql).toContain(`"records"."${field}" =`);
    expect(query.sql).toContain("->>'userId'");
    expect(query.sql).toContain("->>'read'");
    expect(mocks.invalidate).toHaveBeenCalledWith("makeup", ["self"]);
  });
  it("does not write for an empty snapshot or invalidate an already read one", async () => {
    await expect(readNotifications(context, { ids: [] })).resolves.toEqual({ read: 0 });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.returning.mockResolvedValue([]);
    await expect(readNotifications(context, { ids: ["first"] })).resolves.toEqual({ read: 0 });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("rejects attempts to override ownership and scope", async () => {
    await expect(readNotifications(context, { ids: ["first"], userId: "other" })).rejects.toThrow();
    await expect(
      readNotifications(context, { ids: ["first"], departmentId: "other" }),
    ).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
