import { describe, expect, it } from "vitest";
import { canManageRecord } from "../src/shared/record-permissions";
import type { RecordKind } from "../src/shared/contracts";

const member = { id: "member", role: "user" as const };
const admin = { id: "admin", role: "admin" as const };
const other = { createdBy: "other", data: { userId: "other" } };
describe("shared working permissions", () => {
  it.each<RecordKind>([
    "productions",
    "people",
    "actors",
    "characters",
    "casting",
    "sprints",
    "tasks",
    "templates",
    "materials",
    "handovers",
  ])("members create and manage shared %s", (kind) => {
    expect(canManageRecord(member, kind)).toBe(true);
    expect(canManageRecord(member, kind, other)).toBe(true);
  });
  it("category administration stays with admins", () => {
    for (const kind of ["categories", "calendarCategories"] as const) {
      expect(canManageRecord(member, kind)).toBe(false);
      expect(canManageRecord(admin, kind)).toBe(true);
    }
  });
  it("members plan only their own calendar; admins plan for others", () => {
    const own = { ...other, data: { participantIds: [member.id] } };
    const foreign = { ...other, data: { participantIds: ["other"] } };
    const group = { ...other, data: { participantIds: [member.id, "other"] } };
    expect(canManageRecord(member, "events")).toBe(true);
    expect(canManageRecord(member, "events", own)).toBe(true);
    for (const record of [foreign, group, other]) {
      expect(canManageRecord(member, "events", record)).toBe(false);
      expect(canManageRecord(admin, "events", record)).toBe(true);
    }
  });
  it("personal bookings and requests retain ownership", () => {
    for (const kind of ["time", "attendance", "leave"] as const) {
      expect(canManageRecord(member, kind, other)).toBe(false);
      expect(canManageRecord(admin, kind, other)).toBe(true);
      expect(canManageRecord(member, kind, { ...other, data: { userId: member.id } })).toBe(true);
    }
  });
  it("private messages, feedback and chats remain protected", () => {
    const privateMessage = { ...other, data: { userId: "other", conversationId: "private" } };
    expect(canManageRecord(admin, "messages", privateMessage)).toBe(false);
    expect(canManageRecord(member, "conversations", other)).toBe(false);
    expect(canManageRecord(admin, "feedback", other)).toBe(false);
  });
  it("shared looks are editable; private drafts remain private", () => {
    expect(canManageRecord(member, "looks", { ...other, data: { status: "published" } })).toBe(
      true,
    );
    expect(canManageRecord(member, "looks", { ...other, data: { status: "draft" } })).toBe(false);
  });
  it("approved absences and workflow records cannot be changed through generic CRUD", () => {
    expect(canManageRecord(member, "events", { ...other, data: { leaveId: "request" } })).toBe(
      false,
    );
    for (const kind of ["timesheets", "notifications", "files"] as const)
      expect(canManageRecord(admin, kind)).toBe(false);
  });
});
