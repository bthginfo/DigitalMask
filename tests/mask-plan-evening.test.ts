import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DomainRecord } from "@/shared/contracts";
import {
  automaticMaskPlan,
  defaultEventMaskPlanId,
  eventMaskPlan,
  eveningLanes,
  findShowEvent,
  maskPlanEventQuery,
  nowLineMinutes,
} from "@/modules/mask-plans/evening";
import { validateEventMaskPlan } from "@/modules/mask-plans/service";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";

const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
  updatedAt = "2026-11-01T10:00:00.000Z",
): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "theatre",
  departmentId: "makeup",
  createdBy: "admin",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt,
  version: 1,
});
const ama = record(
  "maskPlans",
  "ama",
  { productionId: "faust", title: "AMA" },
  "2026-11-02T08:00Z",
);
const premiere = record(
  "maskPlans",
  "premiere",
  { productionId: "faust", title: "Premiere" },
  "2026-11-20T08:00Z",
);
const otherProduction = record("maskPlans", "other", { productionId: "nathan", title: "Plan" });
const show = (data: DomainRecord["data"] = {}) =>
  record("events", "show", {
    productionId: "faust",
    category: "performance",
    start: "2026-11-27T18:30:00.000Z",
    end: "2026-11-27T21:30:00.000Z",
    participantIds: ["anna", "clara"],
    ...data,
  });

describe("mask plan for a performance", () => {
  it("uses the only plan or the most recently changed one automatically", () => {
    expect(automaticMaskPlan([ama])?.id).toBe("ama");
    expect(automaticMaskPlan([ama, premiere])?.id).toBe("premiere");
    expect(automaticMaskPlan([])).toBeUndefined();
    expect(defaultEventMaskPlanId([ama])).toBe("ama");
    expect(defaultEventMaskPlanId([ama, premiere])).toBe("");
  });

  it("opens the plan chosen for the event and falls back when it is gone", () => {
    const plans = [ama, premiere, otherProduction];
    expect(eventMaskPlan(show({ maskPlanId: "ama" }), plans)?.id).toBe("ama");
    expect(eventMaskPlan(show({ maskPlanId: "" }), plans)?.id).toBe("premiere");
    expect(eventMaskPlan(show({ maskPlanId: "deleted" }), plans)?.id).toBe("premiere");
    // A plan of another production is never used for this evening.
    expect(eventMaskPlan(show({ maskPlanId: "other" }), plans)?.id).toBe("premiere");
    expect(eventMaskPlan(undefined, plans)).toBeUndefined();
  });

  it("links exactly that plan together with the evening", () => {
    const query = maskPlanEventQuery({
      productionId: "faust",
      planId: "ama",
      eventId: "show",
      showStart: "2026-11-27T18:30:00.000Z",
    });
    expect(Object.fromEntries(query)).toEqual({
      module: "productions",
      productionId: "faust",
      tab: "mask-plan",
      planId: "ama",
      eventId: "show",
      showStart: "2026-11-27T18:30:00.000Z",
    });
    expect(maskPlanEventQuery({ productionId: "faust" }).has("planId")).toBe(false);
  });

  it("finds the event of older links that only carry the beginning", () => {
    const weekly = show({
      start: "2026-11-20T18:30:00.000Z",
      end: "2026-11-20T21:30:00.000Z",
      recurrence: "weekly",
      until: "2026-12-31",
    });
    expect(findShowEvent([weekly], "faust", "2026-11-27T18:30:00.000Z")?.id).toBe("show");
    expect(findShowEvent([weekly], "faust", "2026-11-28T18:30:00.000Z")).toBeUndefined();
    expect(findShowEvent([weekly], "nathan", "2026-11-27T18:30:00.000Z")).toBeUndefined();
  });

  it("validates the chosen plan on the server and clears a deleted one", async () => {
    const stored = new Map([
      ["ama", { productionId: "faust" }],
      ["other", { productionId: "nathan" }],
    ]);
    const tx = {
      select: () => ({
        from: () => ({
          where: (where: SQL) => ({
            limit: async () => {
              const { params } = new PgDialect().sqlToQuery(where);
              const id = [...stored.keys()].find((key) => params.includes(key));
              return id ? [stored.get(id)] : [];
            },
          }),
        }),
      }),
    } as unknown as Transaction;
    const context = { departmentId: "makeup" } as Context;
    const valid = { productionId: "faust", maskPlanId: "ama" };
    await validateEventMaskPlan(context, valid, tx);
    expect(valid.maskPlanId).toBe("ama");
    const deleted = { productionId: "faust", maskPlanId: "deleted" };
    await validateEventMaskPlan(context, deleted, tx);
    expect(deleted.maskPlanId).toBe("");
    await expect(
      validateEventMaskPlan(context, { productionId: "faust", maskPlanId: "other" }, tx),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("evening crew", () => {
  const plan = {
    lanes: [
      { id: "lane-1", label: "Platz 1", memberIds: ["anna"], staffNames: [] },
      { id: "lane-2", label: "Platz 2", memberIds: ["berta", "doris"], staffNames: ["Aushilfe"] },
      { id: "lane-3", label: "Platz 3", memberIds: ["emil"], staffNames: [] },
    ],
  };

  it("keeps the configured crew and marks who is not working this evening", () => {
    const view = eveningLanes(plan, ["anna", "clara", "doris", "fritz"], { userId: "anna" });
    expect(view.lanes.get("lane-1")).toEqual({
      laneId: "lane-1",
      people: [{ id: "anna", status: "planned" }],
      mine: true,
    });
    expect(view.lanes.get("lane-2")?.people).toEqual([
      { id: "berta", status: "absent" },
      { id: "doris", status: "planned" },
    ]);
    expect(view.absentCount).toBe(2);
    expect(view.absentIds).toEqual(["berta", "emil"]);
    expect(view.unplaced).toEqual(["clara", "fritz"]);
    expect(view.covers).toEqual([]);
  });

  it("replaces absent members in order with participants who have no lane", () => {
    const view = eveningLanes(plan, ["anna", "clara", "doris", "fritz"], {
      replace: true,
      userId: "fritz",
    });
    expect(view.lanes.get("lane-2")?.people).toEqual([
      { id: "clara", status: "cover", replaces: "berta" },
      { id: "doris", status: "planned" },
    ]);
    expect(view.lanes.get("lane-3")).toEqual({
      laneId: "lane-3",
      people: [{ id: "fritz", status: "cover", replaces: "emil" }],
      mine: true,
    });
    expect(view.covers).toEqual([
      { id: "clara", replaces: "berta" },
      { id: "fritz", replaces: "emil" },
    ]);
    expect(view.absentIds).toEqual([]);
    expect(view.unplaced).toEqual([]);
  });

  it("leaves absent members visible when nobody is free", () => {
    const view = eveningLanes(plan, ["anna", "doris"], { replace: true, userId: "emil" });
    expect(view.lanes.get("lane-3")).toMatchObject({
      people: [{ id: "emil", status: "absent" }],
      mine: false,
    });
    expect(view.absentIds).toEqual(["berta", "emil"]);
  });

  it("marks nobody as missing for an event without participants", () => {
    const view = eveningLanes(plan, [], { replace: true, userId: "emil" });
    expect(view.staffed).toBe(false);
    expect(view.absentCount).toBe(0);
    expect(view.lanes.get("lane-3")?.mine).toBe(true);
  });

  it("shows the now line only inside the plan window", () => {
    const beginning = Date.parse("2026-11-27T18:30:00.000Z");
    expect(nowLineMinutes(beginning, beginning - 45 * 60000, -90)).toBe(-45);
    expect(nowLineMinutes(beginning, beginning, -90)).toBe(0);
    expect(nowLineMinutes(beginning, beginning - 91 * 60000, -90)).toBeNull();
    expect(nowLineMinutes(beginning, beginning + 60000, -90)).toBeNull();
    expect(nowLineMinutes(Number.NaN, beginning, -90)).toBeNull();
  });
});
