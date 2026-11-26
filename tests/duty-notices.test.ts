import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/platform/db";
import type { outbox } from "@/platform/db/schema";
import {
  dutyNoticeWindowMs,
  dutySummary,
  mergeDutyNotice,
  type DutyEntry,
} from "@/modules/notifications/duty";
import { upsertDutyNotice } from "@/platform/events/notices";

type Notice = {
  id: string;
  ownerId: string;
  data: Record<string, unknown>;
  version: number;
  createdAt: Date;
};
let store: Notice[] = [];
let locks: string[] = [];
/** The rows the duty query selects: this person's recent duty notices, newest first. */
const tx = {
  execute: async (query: { queryChunks?: unknown[] }) => {
    locks.push(JSON.stringify(query.queryChunks?.map(String)));
  },
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () =>
            store
              .filter(
                (row) =>
                  row.ownerId === current.user &&
                  row.data.type === "ServiceChangedV1" &&
                  +row.createdAt >= Date.now() - dutyNoticeWindowMs,
              )
              .sort((a, b) => +b.createdAt - +a.createdAt),
        }),
      }),
    }),
  }),
  update: () => ({
    set: (values: { data: Record<string, unknown>; version: number }) => ({
      where: async () => {
        const row = store.find((item) => item.id === current.updating);
        if (row) Object.assign(row, values);
      },
    }),
  }),
  insert: () => ({
    values: (values: Notice) => ({
      onConflictDoNothing: async () => {
        if (!store.some((row) => row.id === values.id))
          store.push({ ...values, version: 1, createdAt: new Date() });
      },
    }),
  }),
} as unknown as Transaction;
const current = { user: "", updating: "" };

const event = (id: string, title: string, body: string, start: string, allDay = false) =>
  ({
    id,
    departmentId: "makeup",
    type: "ServiceChangedV1",
    payload: {
      userIds: ["person"],
      title,
      body,
      start,
      allDay,
      link: "/?module=calendar",
      recordId: `event-${id}`,
      productionId: "play",
      actorId: "planner",
      organizationId: "theatre",
    },
    attempts: 0,
    status: "processing",
    availableAt: new Date(),
    createdAt: new Date(),
  }) as typeof outbox.$inferSelect;

async function deliver(item: ReturnType<typeof event>, userId = "person") {
  current.user = userId;
  // The duty notice that would be merged is the newest unread one.
  current.updating =
    store
      .filter((row) => row.ownerId === userId && row.data.read !== true)
      .sort((a, b) => +b.createdAt - +a.createdAt)[0]?.id || "";
  return upsertDutyNotice(tx, item, userId);
}

beforeEach(() => {
  store = [];
  locks = [];
  vi.useFakeTimers({ now: new Date("2026-11-26T12:00:00Z") });
});

describe("duty notice coalescing", () => {
  it("creates one notice and one push, then merges a painted batch into a summary", async () => {
    expect(await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"))).toBe(
      "notice:e1:person",
    );
    expect(store[0].data).toMatchObject({
      title: "Neuer Dienst",
      body: "Faust",
      recordId: "event-e1",
      sourceEventIds: ["e1"],
    });
    vi.advanceTimersByTime(60_000);
    expect(
      await deliver(event("e2", "Neuer Dienst", "Probe", "2026-12-01T09:00:00Z")),
    ).toBeUndefined();
    expect(
      await deliver(event("e3", "Neuer Dienst", "Urlaub", "2026-12-03T00:00:00Z", true)),
    ).toBeUndefined();
    expect(
      await deliver(event("e4", "Neuer Dienst", "Maske", "2026-12-04T17:00:00Z")),
    ).toBeUndefined();
    expect(store).toHaveLength(1);
    expect(store[0].data).toMatchObject({
      title: "4 neue Dienste",
      body: "Probe · Di., 01.12., 10:00; Faust · Mi., 02.12., 19:30; Urlaub · Do., 03.12. …",
      recordId: "",
      read: false,
      sourceEventIds: ["e1", "e2", "e3", "e4"],
    });
    expect(store[0].version).toBe(4);
    expect(locks).toHaveLength(4);
  });

  it("is idempotent when the outbox delivers an event again", async () => {
    await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"));
    await deliver(event("e2", "Dienst geändert", "Probe", "2026-12-01T09:00:00Z"));
    const before = structuredClone(store);
    // Push of the first notice failed: the retry pushes it again, without changing the summary.
    expect(await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"))).toBe(
      "notice:e1:person",
    );
    expect(
      await deliver(event("e2", "Dienst geändert", "Probe", "2026-12-01T09:00:00Z")),
    ).toBeUndefined();
    expect(store).toEqual(before);
    expect(store[0].data.title).toBe("Dienstplan geändert");
  });

  it("pushes at most once per window, even after the summary was read", async () => {
    await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"));
    store[0].data.read = true;
    vi.advanceTimersByTime(2 * 60_000);
    expect(
      await deliver(event("e2", "Neuer Dienst", "Probe", "2026-12-01T09:00:00Z")),
    ).toBeUndefined();
    expect(store).toHaveLength(2);
    expect(store[1].data).toMatchObject({ silent: true, read: false, title: "Neuer Dienst" });
    // A redelivered silent notice is not pushed either.
    expect(
      await deliver(event("e2", "Neuer Dienst", "Probe", "2026-12-01T09:00:00Z")),
    ).toBeUndefined();
    vi.advanceTimersByTime(dutyNoticeWindowMs + 1);
    expect(await deliver(event("e3", "Neuer Dienst", "Maske", "2026-12-04T17:00:00Z"))).toBe(
      "notice:e3:person",
    );
  });

  it("keeps other people's notices separate", async () => {
    await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"), "person");
    expect(
      await deliver(event("e1", "Neuer Dienst", "Faust", "2026-12-02T18:30:00Z"), "colleague"),
    ).toBe("notice:e1:colleague");
    expect(store.map((row) => row.ownerId)).toEqual(["person", "colleague"]);
  });
});

describe("duty summaries", () => {
  const entry = (title: string, change: DutyEntry["change"]): DutyEntry => ({
    title,
    start: "",
    allDay: false,
    change,
  });
  it("names new duties or a changed plan and lists at most three", () => {
    expect(dutySummary([entry("A", "new"), entry("B", "new")], 2)).toEqual({
      title: "2 neue Dienste",
      body: "A; B",
    });
    expect(dutySummary([entry("A", "new"), entry("B", "changed")], 5).title).toBe(
      "Dienstplan geändert",
    );
  });
  it("upgrades a notice written before coalescing existed", () => {
    const merged = mergeDutyNotice(
      { id: "notice:old:person", data: { title: "Dienst geändert", body: "Faust", read: false } },
      "new",
      { title: "Neuer Dienst", body: "Probe" },
    );
    expect(merged).toMatchObject({
      title: "Dienstplan geändert",
      sourceEventIds: ["old", "new"],
    });
    expect(
      mergeDutyNotice({ id: "notice:old:person", data: {} }, "old", { title: "Neuer Dienst" }),
    ).toBeUndefined();
  });
});
