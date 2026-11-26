import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import type { records } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";

const mocks = vi.hoisted(() => ({ project: vi.fn(), guest: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: {} }));
vi.mock("@/modules/records/repository", () => ({
  assertProject: mocks.project,
  findRecord: vi.fn(),
  serialize: vi.fn(),
}));
vi.mock("@/modules/chat/permissions", () => ({ assertConversation: vi.fn() }));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/modules/productions/guest-access", () => ({
  guestMayRead: mocks.guest,
  showEventAllowsGuests: vi.fn(),
}));
vi.mock("@/platform/events", () => ({
  emit: vi.fn(),
  auditChange: vi.fn(),
  scheduleEvents: vi.fn(),
}));
import { assertRead } from "@/modules/records/service";

const context = {
  user: { id: "guest", role: "user" },
  organizationId: "theatre",
  departmentId: "makeup",
} as Context;
const plan: typeof records.$inferSelect = {
  id: "plan",
  kind: "maskPlans",
  createdBy: "lead",
  version: 1,
  organizationId: "theatre",
  departmentId: "makeup",
  productionId: "faust",
  ownerId: null,
  parentId: null,
  startAt: null,
  endAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  data: { productionId: "faust", title: "Premiere" },
};
const tx = {} as Transaction;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockRejectedValue(new HttpError(403, "Kein Produktionszugriff"));
  mocks.guest.mockResolvedValue(true);
});

describe("guest read access enforcement", () => {
  it("is only consulted by read endpoints", async () => {
    await expect(assertRead(context, plan, tx, "guest")).resolves.toBeUndefined();
    expect(mocks.guest).toHaveBeenCalledWith(context, plan);
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it("never opens write, delete or upload checks, which use member access", async () => {
    await expect(assertRead(context, plan, tx)).rejects.toMatchObject({ status: 403 });
    expect(mocks.guest).not.toHaveBeenCalled();
  });

  it("falls back to production membership when the evening does not grant access", async () => {
    mocks.guest.mockResolvedValue(false);
    await expect(assertRead(context, plan, tx, "guest")).rejects.toMatchObject({ status: 403 });
    expect(mocks.project).toHaveBeenCalledWith(context, "faust", tx);
  });

  it("keeps draft privacy for guests", async () => {
    const draft = { ...plan, kind: "looks" as const, data: { productionId: "faust" } };
    await expect(assertRead(context, draft, tx, "guest")).rejects.toMatchObject({ status: 403 });
  });
});
