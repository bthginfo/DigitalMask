import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { records } from "@/platform/db/schema";
import type { RecordData } from "@/shared/contracts";
import { notificationHref } from "@/modules/notifications/links";
import { pushPayload } from "@/modules/notifications/payload";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  emit: vi.fn(),
  invalidate: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/platform/events", () => ({
  auditChange: vi.fn(),
  emit: mock.emit,
  scheduleEvents: mock.schedule,
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mock.invalidate }));
import { saveRecord } from "@/modules/records/service";

const context = (role: "admin" | "user" = "user") =>
  ({
    user: { id: "requester", name: "Alex Beispiel", role },
    organizationId: "theatre",
    departmentId: "makeup",
  }) as Context;

beforeEach(() => {
  vi.clearAllMocks();
  const tx = {
    execute: vi.fn(),
    insert: () => ({
      values: (values: RecordData) => ({
        returning: async () =>
          [
            { ...values, createdAt: new Date(), updatedAt: new Date(), version: 1 },
          ] as (typeof records.$inferSelect)[],
      }),
    }),
  };
  mock.transaction.mockImplementation(async (run: (value: typeof tx) => unknown) => run(tx));
});

describe("decisions that wait for an admin", () => {
  it.each(["user", "admin"] as const)(
    "asks the other admins about a new leave request by a %s",
    async (role) => {
      const leave = await saveRecord(context(role), "leave", {
        start: "2026-12-24",
        end: "2026-12-26",
        reason: "Familie",
        status: "approved",
      });
      expect(leave.data.status).toBe("pending");
      expect(mock.emit).toHaveBeenCalledWith(
        expect.anything(),
        context(role),
        "AdminDecisionRequestedV1",
        {
          title: "Neuer Freiwunsch",
          body: "Alex Beispiel · 2026-12-24 bis 2026-12-26",
          link: `/?module=calendar&leaveId=${leave.id}`,
          recordId: leave.id,
          excludeUserIds: ["requester"],
        },
      );
      expect(mock.schedule).toHaveBeenCalledOnce();
    },
  );

  it("opens the stored request link, also from a device notification", () => {
    for (const link of [
      "/?module=calendar&leaveId=leave-1",
      "/?module=calendar&swapId=swap-1",
      "/?module=settings",
    ]) {
      const data = { type: "AdminDecisionRequestedV1", recordId: "leave-1", link };
      expect(notificationHref(data)).toBe(link);
      expect(pushPayload("AdminDecisionRequestedV1", "notice", "admin", 1, data)).toMatchObject({
        url: link,
        title: "DigitalMask · Eine Anfrage wartet auf deine Freigabe",
      });
    }
  });
});
