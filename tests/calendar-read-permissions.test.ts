import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import type { records } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";

const mocks = vi.hoisted(() => ({ project: vi.fn(), conversation: vi.fn(), find: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: {} }));
vi.mock("@/modules/records/repository", () => ({
  assertProject: mocks.project,
  findRecord: mocks.find,
  serialize: vi.fn(),
}));
vi.mock("@/modules/chat/permissions", () => ({ assertConversation: mocks.conversation }));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: vi.fn() }));
vi.mock("@/platform/events", () => ({
  emit: vi.fn(),
  auditChange: vi.fn(),
  scheduleEvents: vi.fn(),
}));
vi.mock("@/modules/workflows/locks", () => ({ acquireWorkflowLock: vi.fn() }));
import { assertRead, assertWrite, deleteRecord, saveRecord } from "@/modules/records/service";

const context = {
  user: { id: "viewer", role: "user" },
  organizationId: "theatre",
  departmentId: "makeup",
} as Context;
const event: typeof records.$inferSelect = {
  id: "event",
  kind: "events",
  createdBy: "colleague",
  version: 1,
  organizationId: "theatre",
  departmentId: "makeup",
  productionId: "closed-production",
  ownerId: null,
  parentId: null,
  startAt: null,
  endAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
  data: { productionId: "closed-production", participantIds: ["viewer"] },
};
const tx = {} as Transaction;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockImplementation(async (_context, id) => {
    if (id === "closed-production") throw new HttpError(403, "Kein Produktionszugriff");
  });
  mocks.conversation.mockImplementation(async (_context, id) => {
    if (id === "private-chat") throw new HttpError(403, "Privater Chat");
  });
  mocks.find.mockResolvedValue(event);
});

describe("calendar read and write boundaries", () => {
  it("reads a production event without checking production membership", async () => {
    await expect(assertRead(context, event, tx)).resolves.toBeUndefined();
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("retains production and private chat restrictions for other data", async () => {
    await expect(assertRead(context, { ...event, kind: "tasks" }, tx)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      assertRead(
        context,
        { ...event, data: { ...event.data, conversationId: "private-chat" } },
        tx,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.conversation).toHaveBeenCalledWith(context, "private-chat", tx);
  });
  it("does not grant editing, deletion or file/document writing through shared read access", async () => {
    await expect(assertWrite(context, "events", event, tx)).rejects.toMatchObject({ status: 403 });
    expect(mocks.project).toHaveBeenLastCalledWith(context, "closed-production", tx);
    await expect(
      deleteRecord(context, "events", event.id, { transaction: tx }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRecord(context, "events", {}, event.id, 1, { transaction: tx }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("still restricts normal members to their own calendar even with production access", async () => {
    mocks.project.mockResolvedValue(undefined);
    await expect(
      assertWrite(context, "events", { ...event, data: { participantIds: ["colleague"] } }, tx),
    ).rejects.toMatchObject({ status: 403 });
    await expect(assertWrite(context, "events", event, tx)).resolves.toBeUndefined();
  });
});
