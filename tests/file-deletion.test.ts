import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { RecordData } from "@/shared/contracts";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  emit: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/modules/records/repository", () => ({ findRecord: mock.find, serialize: vi.fn() }));
vi.mock("@/modules/records/service", () => ({ assertRead: mock.read, assertWrite: mock.write }));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mock.invalidate }));
vi.mock("@/platform/events", () => ({
  emit: mock.emit,
  auditChange: mock.audit,
  scheduleEvents: mock.schedule,
}));
vi.mock("@/modules/files/portrait-analysis", () => ({ analyzePortrait: vi.fn() }));
vi.mock("@/modules/files/actor-portraits", () => ({ normalizeActorPortrait: vi.fn() }));
import { deleteFile } from "@/modules/files/service";

const context = { user: { id: "editor", role: "admin" }, departmentId: "makeup" } as Context;
function fixture(kind = "actors") {
  const parent = {
    id: "parent",
    kind,
    version: 3,
    data: {
      imageIds: ["file", "retained"],
      attachmentIds: ["file", "retained"],
      portraitFileId: "file",
      portraitSourceUrl: "https://example.test/portrait",
      portraitCredit: "Credit",
    },
  };
  const file = {
    id: "file",
    kind: "files",
    data: { recordId: "parent", recordKind: kind, path: "private/original.xlsx" },
  };
  const updates: { data: RecordData; version: number }[] = [];
  const remove = vi.fn().mockResolvedValue(undefined);
  const tx = {
    update: () => ({
      set: (data: { data: RecordData; version: number }) => ({
        where: async () => updates.push(data),
      }),
    }),
    delete: () => ({ where: remove }),
  };
  mock.find.mockImplementation(async (_context: unknown, id: string) =>
    id === "file" ? file : parent,
  );
  mock.transaction.mockImplementation(async (run: (tx: unknown) => Promise<void>) => run(tx));
  return { parent, file, updates, remove, tx };
}

beforeEach(() => vi.resetAllMocks());
describe("attachment deletion without workspace undo", () => {
  it("removes the portrait reference and metadata, then queues protected blob cleanup", async () => {
    const state = fixture();
    await deleteFile(context, "file");
    expect(state.updates[0]).toMatchObject({
      version: 4,
      data: {
        imageIds: ["retained"],
        portraitFileId: "",
        portraitSourceUrl: "",
        portraitCredit: "",
      },
    });
    expect(state.remove).toHaveBeenCalledOnce();
    expect(mock.emit).toHaveBeenCalledWith(state.tx, context, "FileDeletionRequestedV1", {
      path: "private/original.xlsx",
      fileId: "file",
    });
    expect(mock.audit).toHaveBeenCalledWith(state.tx, context, "file.deleted", "file");
    expect(mock.invalidate).toHaveBeenCalledWith("makeup");
    expect(mock.schedule).toHaveBeenCalledOnce();
  });
  it("unlinks a chat attachment without removing the remaining references", async () => {
    const state = fixture("messages");
    await deleteFile(context, "file");
    expect(state.updates[0].data.attachmentIds).toEqual(["retained"]);
    expect(mock.find).toHaveBeenCalledWith(context, "parent", undefined, state.tx, true);
  });
  it("checks the parent permissions before deleting anything", async () => {
    const state = fixture();
    mock.read.mockRejectedValue(new Error("Private parent"));
    await expect(deleteFile(context, "file")).rejects.toThrow("Private parent");
    expect(state.updates).toEqual([]);
    expect(state.remove).not.toHaveBeenCalled();
    expect(mock.emit).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });
});
