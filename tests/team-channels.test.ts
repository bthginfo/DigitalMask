import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/platform/context";
import type { Transaction } from "../src/platform/db";
import type { RecordData } from "../src/shared/contracts";
import { canManageRecord } from "../src/shared/record-permissions";
import { validateRecord } from "../src/modules/records/schemas";

const { findRecord } = vi.hoisted(() => ({ findRecord: vi.fn() }));
vi.mock("../src/platform/db", () => ({ db: {} }));
vi.mock("../src/modules/records/repository", () => ({ findRecord }));
import { assertConversation } from "../src/modules/chat/permissions";
import { prepareConversation } from "../src/modules/chat/conversations";

const member = { id: "member", role: "user" as const };
const admin = { id: "admin", role: "admin" as const };
const context = (user: typeof member | typeof admin): Context =>
  ({ user, departmentId: "maske" }) as Context;
const tx = {} as Transaction;
const existing = (mode: string) =>
  ({ createdBy: "other-admin", data: { mode } }) as unknown as NonNullable<
    Parameters<typeof prepareConversation>[3]
  >;

describe("public team channels and private conversation boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a team channel name and still requires two private participants", () => {
    expect(
      validateRecord("conversations", { mode: "team", title: "Werkstatt" }).participantIds,
    ).toEqual([]);
    expect(() => validateRecord("conversations", { mode: "team", title: "  " })).toThrow();
    for (const mode of ["direct", "group"])
      expect(() => validateRecord("conversations", { mode, participantIds: ["member"] })).toThrow();
  });

  it("admins create a dynamic team channel without freezing its member roster", async () => {
    const data: RecordData = { mode: "team", title: " Werkstatt ", participantIds: ["old"] };
    await prepareConversation(context(admin), data, tx);
    expect(data).toMatchObject({ title: "Werkstatt", participantIds: [], directKey: "" });
    await expect(
      prepareConversation(context(member), { mode: "team", title: "Kanal" }, tx),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("another admin manages team channels while normal members cannot", () => {
    const record = existing("team");
    expect(canManageRecord(admin, "conversations", record)).toBe(true);
    expect(canManageRecord(member, "conversations", record)).toBe(false);
    expect(canManageRecord(admin, "conversations", existing("group"))).toBe(false);
  });

  it("never allows a private conversation to become public or vice versa", async () => {
    await expect(
      prepareConversation(context(admin), { mode: "team", title: "Public" }, tx, existing("group")),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      prepareConversation(
        context(admin),
        { mode: "group", participantIds: ["admin", "member"] },
        tx,
        existing("team"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("a newly registered active team member accesses a team channel without a participant entry", async () => {
    const channel = { data: { mode: "team", participantIds: [] } };
    findRecord.mockResolvedValue(channel);
    await expect(assertConversation(context(member), "team-channel", tx)).resolves.toBe(channel);
  });

  it("private groups remain invisible even to unrelated admins", async () => {
    findRecord.mockResolvedValue({ data: { mode: "group", participantIds: ["other", "member"] } });
    await expect(assertConversation(context(admin), "private-channel", tx)).rejects.toMatchObject({
      status: 403,
    });
    await expect(assertConversation(context(member), "private-channel", tx)).resolves.toBeDefined();
  });
});
