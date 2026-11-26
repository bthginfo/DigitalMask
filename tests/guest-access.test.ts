import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { memberships, records } from "@/platform/db/schema";
import type { DomainRecord } from "@/shared/contracts";
import { isShowCategory, isShowEvent } from "@/modules/calendar/show-events";
import {
  guestAccessWindow,
  guestCanRead,
  guestProductionIdsFrom,
  isGuestProduction,
} from "@/modules/productions/guest-rules";
import { guestAccessChanged, workspacePatch } from "@/shared/workspace-sync";

const state = vi.hoisted(() => ({ select: vi.fn(), queries: [] as unknown[][] }));
vi.mock("@/platform/db", () => ({ db: { select: state.select } }));
vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
  revalidateTag: vi.fn(),
}));
vi.mock("@/platform/context", () => ({ scopeTag: (id: string) => `workspace:${id}` }));
vi.mock("@/platform/realtime", () => ({ scheduleLiveChange: vi.fn() }));
import { getWorkspace } from "@/modules/records/workspace";

const now = new Date("2026-11-26T10:00:00.000Z");
const context: Context = {
  organizationId: "theatre",
  organizationName: "Fiktives Theater",
  departmentId: "makeup",
  departmentName: "Maske",
  user: { id: "guest", name: "Gast Beispiel", username: "gast", status: "active", role: "user" },
};
const row = (kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: context.organizationId,
  departmentId: context.departmentId,
  createdBy: "lead",
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
  version: 1,
});
const event = (id: string, data: DomainRecord["data"]) =>
  row("events", id, {
    productionId: "faust",
    category: "performance",
    start: "2026-11-27T18:30:00.000Z",
    end: "2026-11-27T21:30:00.000Z",
    participantIds: ["guest"],
    ...data,
  });

describe("performances and rehearsals", () => {
  it("recognises performance and rehearsal categories by key or name", () => {
    for (const [key, name] of [
      ["performance", "Vorstellung"],
      ["rehearsal", "Probe"],
      ["custom-1", "HP1"],
      ["custom-2", "GP"],
      ["custom-3", "AMA"],
      ["custom-4", "Kostümprobe"],
      ["custom-5", "Premiere"],
    ])
      expect(isShowCategory(key, { name })).toBe(true);
    for (const [key, name] of [
      ["service", "Dienst"],
      ["preparation", "Vorbereitung"],
      ["custom-6", "Probenfrei"],
      ["vacation", "Urlaub"],
    ])
      expect(isShowCategory(key, { name })).toBe(false);
    expect(
      isShowEvent(event("e", { category: "x" }), [
        row("calendarCategories", "c", { key: "x", name: "GP" }),
      ]),
    ).toBe(true);
  });
});

describe("guest read access predicate", () => {
  it("covers the user's performances from yesterday to 60 days ahead", () => {
    const window = guestAccessWindow(now);
    expect(window.day).toBe("2026-11-26");
    expect(window.from.toISOString()).toBe("2026-11-24T23:00:00.000Z");
    expect(window.to.toISOString()).toBe("2027-01-25T23:00:00.000Z");
    const events = [
      event("tomorrow", {}),
      event("yesterday", {
        productionId: "yesterday",
        start: "2026-11-25T18:00:00.000Z",
        end: "2026-11-25T21:00:00.000Z",
      }),
      event("too-old", {
        productionId: "old",
        start: "2026-11-23T18:00:00.000Z",
        end: "2026-11-23T21:00:00.000Z",
      }),
      event("too-far", {
        productionId: "far",
        start: "2027-01-26T18:00:00.000Z",
        end: "2027-01-26T21:00:00.000Z",
      }),
      event("series", {
        productionId: "series",
        start: "2026-09-01T18:00:00.000Z",
        end: "2026-09-01T21:00:00.000Z",
        recurrence: "weekly",
        until: "2027-06-30",
      }),
      event("ended-series", {
        productionId: "ended",
        start: "2026-09-01T18:00:00.000Z",
        end: "2026-09-01T21:00:00.000Z",
        recurrence: "weekly",
        until: "2026-10-31",
      }),
      event("service", { productionId: "service", category: "service" }),
      event("colleague", { productionId: "colleague", participantIds: ["other"] }),
      event("no-production", { productionId: "" }),
    ];
    expect(guestProductionIdsFrom(events, [], "guest", now)).toEqual([
      "faust",
      "series",
      "yesterday",
    ]);
  });

  it("allows only mask plans, Aufschriebe and figures of a guest production", () => {
    expect(guestCanRead("maskPlans", "faust", ["faust"])).toBe(true);
    expect(guestCanRead("looks", "faust", ["faust"])).toBe(true);
    expect(guestCanRead("characters", "faust", ["faust"])).toBe(true);
    for (const kind of ["tasks", "messages", "time", "casting", "productions", "files"] as const)
      expect(guestCanRead(kind, "faust", ["faust"])).toBe(false);
    expect(guestCanRead("maskPlans", "nathan", ["faust"])).toBe(false);
    expect(guestCanRead("maskPlans", "", [""])).toBe(false);
    expect(isGuestProduction({ guestProductionIds: ["faust"] }, "faust")).toBe(true);
    expect(isGuestProduction({}, "faust")).toBe(false);
  });
});

describe("guest workspace", () => {
  const rows = [
    row("productions", "faust", {
      title: "Faust",
      memberIds: ["lead"],
      internalNotes: "PRIVATE PRODUCTION NOTE",
    }),
    row("productions", "nathan", { title: "Nathan", memberIds: ["lead"] }),
    row("calendarCategories", "category", { key: "performance", name: "Vorstellung" }),
    event("show", {}),
    event("duty", { id: "duty", productionId: "nathan", category: "service" }),
    row("maskPlans", "plan-faust", { productionId: "faust", title: "Premiere" }),
    row("maskPlans", "plan-nathan", { productionId: "nathan", title: "PRIVATE PLAN" }),
    row("looks", "look-faust", { productionId: "faust", status: "published" }),
    row("looks", "look-draft", { productionId: "faust", status: "draft" }),
    row("characters", "figure", { productionId: "faust", name: "Gretchen" }),
    row("tasks", "task", { productionId: "faust", title: "PRIVATE TASK" }),
    row("time", "time", { productionId: "faust", userId: "lead", durationSeconds: 60 }),
    row("files", "look-photo", { recordId: "look-faust", path: "blob" }),
    row("files", "task-file", { recordId: "task", path: "PRIVATE PATH" }),
  ];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    state.queries.length = 0;
    state.select.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === records)
          return {
            where: (where: SQL) => {
              const { params } = new PgDialect().sqlToQuery(where);
              state.queries.push(params);
              return {
                orderBy: async () =>
                  rows
                    .filter((record) => params.includes(record.kind))
                    .map((record) => ({
                      ...record,
                      createdAt: new Date(record.createdAt),
                      updatedAt: new Date(record.updatedAt),
                    })),
              };
            },
          };
        if (table === memberships) {
          const team = {
            innerJoin: () => team,
            leftJoin: () => team,
            where: async () => [context.user],
          };
          return team;
        }
        return { where: () => ({ unionAll: async () => [] }) };
      },
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("reads the evening's plan, Aufschriebe and figures without production rights", async () => {
    const workspace = await getWorkspace(context);
    expect(workspace.guestProductionIds).toEqual(["faust"]);
    expect(workspace.records.maskPlans.map((plan) => plan.id)).toEqual(["plan-faust"]);
    expect(workspace.records.looks.map((look) => look.id)).toEqual(["look-faust"]);
    expect(workspace.records.characters.map((figure) => figure.id)).toEqual(["figure"]);
    expect(workspace.records.files.map((file) => file.id)).toEqual(["look-photo"]);
    expect(workspace.records.productions).toEqual([]);
    expect(workspace.records.tasks).toEqual([]);
    expect(workspace.records.time).toEqual([]);
    expect(JSON.stringify(workspace.records)).not.toMatch(/PRIVATE/);
    // One additional, user-scoped query that only selects events and calendar categories.
    const guestQuery = state.queries.find((params) => params.includes('["guest"]'))!;
    expect(guestQuery[0]).toBe("makeup");
    expect(guestQuery).toContain("events");
  });

  it("keeps guest access in live patches and reloads fully when it changes", async () => {
    const patch = workspacePatch(await getWorkspace(context, ["maskPlans"]), ["maskPlans"]);
    expect(patch.records.maskPlans?.map((plan) => plan.id)).toEqual(["plan-faust"]);
    expect(patch.guestProductionIds).toEqual(["faust"]);
    const current = await getWorkspace(context);
    expect(guestAccessChanged(current, patch)).toBe(false);
    expect(guestAccessChanged({ ...current, guestProductionIds: undefined }, patch)).toBe(true);
    expect(guestAccessChanged(current, { ...patch, guestProductionIds: [] })).toBe(true);
    expect(guestAccessChanged(current, current)).toBe(false);
  });

  it("gives admins no guest lookup and team members no guest marker", async () => {
    state.queries.length = 0;
    const admin = await getWorkspace({ ...context, user: { ...context.user, role: "admin" } });
    expect(admin.guestProductionIds).toBeUndefined();
    expect(state.queries.some((params) => params.includes('["guest"]'))).toBe(false);
    rows[0].data.memberIds = ["lead", "guest"];
    try {
      const member = await getWorkspace(context);
      expect(member.guestProductionIds).toBeUndefined();
      expect(member.records.tasks.map((task) => task.id)).toEqual(["task"]);
    } finally {
      rows[0].data.memberIds = ["lead"];
    }
  });
});
