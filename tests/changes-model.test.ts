import { describe, expect, it } from "vitest";
import { assertUndoState, changedFields, visibleChange } from "@/modules/changes/model";
import { restoreRow } from "@/modules/changes/snapshots";
import type { DomainRecord, Workspace } from "@/shared/contracts";

const record = (kind: DomainRecord["kind"] = "tasks", data = {}): DomainRecord => ({
  id: "task",
  kind,
  data,
  createdBy: "editor",
  organizationId: "theatre",
  departmentId: "makeup",
  createdAt: "2026-10-07T08:00:00Z",
  updatedAt: "2026-10-07T08:00:00Z",
  version: 2,
});
const workspace = {
  user: { id: "editor", role: "user" },
  department: { id: "makeup" },
  organization: { id: "theatre" },
  records: { productions: [record("productions", { memberIds: ["editor"] })] },
} as unknown as Workspace;
const operation = () => ({
  userId: "editor",
  departmentId: "makeup",
  organizationId: "theatre",
  expiresAt: new Date("2026-10-07T08:02:00Z"),
  undoneAt: null,
  after: record(),
});
const now = new Date("2026-10-07T08:01:00Z");

describe("short undo and readable change privacy", () => {
  it("accepts the unchanged own record but protects a newer colleague version", () => {
    expect(assertUndoState(operation(), "editor", "makeup", "theatre", record(), now)).toBe("");
    expect(
      assertUndoState(operation(), "editor", "makeup", "theatre", { ...record(), version: 3 }, now),
    ).toContain("inzwischen geändert");
  });
  it("rejects replay, expiry, other owners and other departments", () => {
    expect(
      assertUndoState(
        { ...operation(), undoneAt: now },
        "editor",
        "makeup",
        "theatre",
        record(),
        now,
      ),
    ).toContain("nicht mehr");
    expect(
      assertUndoState(
        operation(),
        "editor",
        "makeup",
        "theatre",
        record(),
        new Date("2026-10-07T08:02:00Z"),
      ),
    ).toContain("nicht mehr");
    expect(assertUndoState(operation(), "other", "makeup", "theatre", record(), now)).toContain(
      "eigenen",
    );
    expect(assertUndoState(operation(), "editor", "other", "theatre", record(), now)).toContain(
      "eigenen",
    );
  });
  it("will not restore a deletion over a newly present record", () => {
    expect(
      assertUndoState(
        { ...operation(), after: null },
        "editor",
        "makeup",
        "theatre",
        record(),
        now,
      ),
    ).toContain("wieder vorhanden");
  });
  it("does not expose private history or invisible production records", () => {
    expect(visibleChange(record("attendance", { userId: "other" }), workspace)).toBe(false);
    expect(
      visibleChange(record("looks", { status: "draft", productionId: "hidden" }), workspace),
    ).toBe(false);
    expect(visibleChange(record("messages", { text: "private" }), workspace)).toBe(false);
    expect(
      visibleChange(record("shiftSwaps", { requesterId: "other", partnerId: "third" }), workspace),
    ).toBe(false);
    expect(
      visibleChange(record("shiftSwaps", { requesterId: "editor", partnerId: "other" }), workspace),
    ).toBe(true);
    expect(visibleChange(record("tasks", { productionId: "hidden" }), workspace)).toBe(false);
    expect(visibleChange(record("tasks", { productionId: "task" }), workspace)).toBe(true);
  });
  it("shows concrete changes and ignores internal import/idempotency metadata", () => {
    expect(
      changedFields(
        { title: "Alt", quantity: 2, idempotencyKey: "one" },
        { title: "Neu", quantity: 2, idempotencyKey: "two" },
      ),
    ).toEqual([{ key: "title", before: "Alt", after: "Neu" }]);
    expect(changedFields({ description: "Bisher" }, {})).toEqual([
      { key: "description", before: "Bisher", after: null },
    ]);
  });
  it("restores stable file scope and SQL timestamps from a JSON snapshot", () => {
    const snapshot = {
      ...record("files", { recordId: "task" }),
      productionId: "production",
      ownerId: null,
      parentId: null,
      startAt: "2026-10-07T08:00:00Z",
    };
    const row = restoreRow(snapshot);
    expect(row.productionId).toBe("production");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.startAt?.toISOString()).toBe("2026-10-07T08:00:00.000Z");
    expect(row.id).toBe(snapshot.id);
  });
});
