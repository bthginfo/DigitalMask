import { beforeEach, describe, expect, it, vi } from "vitest";
import { memberships, outbox, records } from "@/platform/db/schema";

const mocks = vi.hoisted(() => ({
  due: [] as unknown[],
  team: [] as { id: string; role: string }[],
  inserted: [] as { id: string; ownerId: string; data: Record<string, unknown> }[],
  memberQueries: 0,
  done: vi.fn(),
  deliverNotifications: vi.fn(async () => undefined),
  deliverChatPush: vi.fn(async () => undefined),
  invalidateNotifications: vi.fn(),
}));
function chain(rows: () => unknown[]) {
  const result = {
    where: () => result,
    limit: () => result,
    for: () => result,
    orderBy: () => result,
    then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject),
  };
  return result;
}
const tx = {
  select: () => ({
    from: (table: unknown) =>
      chain(() => {
        if (table === outbox) return mocks.due;
        if (table === memberships) {
          mocks.memberQueries++;
          return mocks.team;
        }
        if (table === records) return [];
        return [];
      }),
  }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  insert: () => ({
    values: (values: { id: string; ownerId: string; data: Record<string, unknown> }) => ({
      onConflictDoNothing: async () => {
        mocks.inserted.push(values);
      },
    }),
  }),
  execute: async () => undefined,
};
vi.mock("@/platform/db", () => ({
  db: {
    transaction: async (run: (value: typeof tx) => unknown) => run(tx),
    update: () => ({ set: (values: unknown) => ({ where: async () => mocks.done(values) }) }),
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/modules/notifications/service", () => ({
  deliverNotifications: mocks.deliverNotifications,
  deliverChatPush: mocks.deliverChatPush,
}));
vi.mock("@/modules/records/workspace", () => ({
  invalidateNotifications: mocks.invalidateNotifications,
}));
vi.mock("@/modules/google-calendar/queue", () => ({ enqueueGoogleCalendarWork: vi.fn() }));
import { processEvents } from "@/platform/events";

const event = (type: string, payload: Record<string, unknown>) => ({
  id: `event-${type}`,
  departmentId: "makeup",
  type,
  payload: { actorId: "actor", organizationId: "theatre", ...payload },
  attempts: 0,
  status: "pending",
  availableAt: new Date(),
  createdAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted.length = 0;
  mocks.memberQueries = 0;
});

describe("outbox notifications", () => {
  it("asks active admins and superadmins for a decision, except the people involved", async () => {
    mocks.team = [
      { id: "admin", role: "admin" },
      { id: "root", role: "superadmin" },
      { id: "partner", role: "admin" },
      { id: "actor", role: "admin" },
    ];
    mocks.due = [
      event("AdminDecisionRequestedV1", {
        title: "Diensttausch zur Freigabe",
        body: "Faust · 02.12., 19:30",
        link: "/?module=calendar&swapId=swap",
        recordId: "swap",
        excludeUserIds: ["partner"],
      }),
    ];
    await processEvents();
    expect(mocks.inserted.map((row) => row.ownerId).sort()).toEqual(["admin", "root"]);
    expect(mocks.inserted[0].data).toMatchObject({
      type: "AdminDecisionRequestedV1",
      title: "Diensttausch zur Freigabe",
      link: "/?module=calendar&swapId=swap",
      read: false,
    });
    expect(mocks.deliverNotifications).toHaveBeenCalledWith("makeup", "AdminDecisionRequestedV1", [
      "notice:event-AdminDecisionRequestedV1:admin",
      "notice:event-AdminDecisionRequestedV1:root",
    ]);
    expect(mocks.invalidateNotifications).toHaveBeenCalledWith(
      "makeup",
      expect.arrayContaining(["admin", "root"]),
      { origin: null },
    );
    expect(mocks.done).toHaveBeenCalledWith({ status: "done" });
  });

  it("pushes team chat messages without storing a notification per member", async () => {
    mocks.team = [
      { id: "actor", role: "user" },
      { id: "colleague", role: "user" },
      { id: "lead", role: "admin" },
    ];
    mocks.due = [
      event("ChatMessageCreatedV1", {
        audience: "team",
        title: "Neue Nachricht",
        body: "Bitte Perücke vorbereiten",
        productionId: "",
        recordId: "message",
        link: "/?module=chat",
      }),
    ];
    await processEvents();
    expect(mocks.inserted).toEqual([]);
    expect(mocks.deliverChatPush).toHaveBeenCalledWith(
      "makeup",
      "event-ChatMessageCreatedV1",
      ["colleague", "lead"],
      expect.objectContaining({ recordId: "message" }),
    );
    expect(mocks.deliverNotifications).not.toHaveBeenCalled();
    // Recipients' unread counters follow the "messages" signal of the write itself.
    expect(mocks.invalidateNotifications).not.toHaveBeenCalled();
  });
});
