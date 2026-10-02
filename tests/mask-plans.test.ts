import { describe, expect, it, vi } from "vitest";
import { maskPlanSchema } from "@/modules/mask-plans/schema";
import {
  cloneMaskPlan,
  maskPlanClock,
  maskPlanOverlaps,
  maskPlanWindow,
  newMaskPlan,
} from "@/modules/mask-plans/model";
import { maskPlanPrintSegments, maskPlanTracks } from "@/modules/mask-plans/layout";
import { validateMaskPlanActors } from "@/modules/mask-plans/service";
import { canManageRecord } from "@/shared/record-permissions";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";

const laneId = "11111111-1111-4111-8111-111111111111";
const secondLane = "22222222-2222-4222-8222-222222222222";
const blockId = "33333333-3333-4333-8333-333333333333";
const secondBlock = "44444444-4444-4444-8444-444444444444";
const plan = () =>
  maskPlanSchema.parse({
    ...newMaskPlan("production"),
    lanes: [{ id: laneId, memberIds: ["member"], staffNames: ["Janine"] }],
    blocks: [
      {
        id: blockId,
        laneId,
        startMinutes: -60,
        durationMinutes: 30,
        actorIds: ["actor"],
        title: "Schminken",
      },
    ],
  });

describe("production mask plans", () => {
  it("validates relative appointments and preserves individually entered names", () => {
    const value = plan();
    expect(value.blocks[0].startMinutes + value.blocks[0].durationMinutes).toBe(-30);
    expect(value.lanes[0].staffNames).toEqual(["Janine"]);
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [{ ...value.blocks[0], startMinutes: -20 }] }),
    ).toThrow("spätestens zum Vorstellungsbeginn");
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [{ ...value.blocks[0], durationMinutes: 0 }] }),
    ).toThrow();
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [{ ...value.blocks[0], startMinutes: 0 }] }),
    ).toThrow();
    expect(() => maskPlanSchema.parse({ ...value, productionId: "" })).toThrow("Produktion");
  });
  it("rejects duplicate IDs and blocks that point to a deleted lane", () => {
    const value = plan();
    expect(() =>
      maskPlanSchema.parse({ ...value, lanes: [...value.lanes, value.lanes[0]] }),
    ).toThrow("eindeutige IDs");
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [...value.blocks, value.blocks[0]] }),
    ).toThrow("eindeutige IDs");
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [{ ...value.blocks[0], laneId: secondLane }] }),
    ).toThrow("vorhandenen Spalte");
    expect(() =>
      maskPlanSchema.parse({ ...value, blocks: [{ ...value.blocks[0], actorIds: [], title: "" }] }),
    ).toThrow("Tätigkeit");
  });
  it("includes earlier appointments in the grid and ends at curtain", () => {
    const value = plan();
    value.blocks[0].startMinutes = -83;
    const window = maskPlanWindow(value);
    expect(window.start).toBe(-85);
    expect(window.ticks[0]).toBe(-85);
    expect(window.ticks.at(-1)).toBe(0);
    expect(window.ticks.length).toBe(18);
  });
  it("calculates clock times across midnight without changing saved offsets", () => {
    expect(maskPlanClock(-20, "19:30")).toBe("19:10");
    expect(maskPlanClock(0, "19:30")).toBe("19:30");
    expect(maskPlanClock(-30, "00:15")).toBe("23:45 (Vortag)");
    expect(maskPlanClock(-30, "24:00")).toBe("");
  });
  it("copies the complete plan with independent lane and block identities", () => {
    const original = plan(),
      copy = cloneMaskPlan(original, "new-production");
    expect(copy.productionId).toBe("new-production");
    expect(copy.lanes[0].id).not.toBe(original.lanes[0].id);
    expect(copy.blocks[0].id).not.toBe(original.blocks[0].id);
    expect(copy.blocks[0].laneId).toBe(copy.lanes[0].id);
    expect(copy.blocks[0].actorIds).toEqual(["actor"]);
    copy.lanes[0].staffNames.push("Extra");
    expect(original.lanes[0].staffNames).toEqual(["Janine"]);
  });
  it("detects shared staff overlaps across lanes but allows adjacent appointments", () => {
    const value = plan();
    value.lanes.push({ ...value.lanes[0], id: secondLane });
    value.blocks.push({
      ...value.blocks[0],
      id: secondBlock,
      laneId: secondLane,
      actorIds: [],
      actorNames: ["Andere Person"],
      startMinutes: -40,
    });
    expect(maskPlanOverlaps(value)).toEqual([
      { firstId: blockId, secondId: secondBlock, reason: "staff" },
    ]);
    value.blocks[1].startMinutes = -30;
    expect(maskPlanOverlaps(value)).toEqual([]);
  });
  it("places overlapping blocks beside each other while isolated groups use the full lane", () => {
    const value = plan();
    const overlapping = {
      ...value.blocks[0],
      id: secondBlock,
      startMinutes: -50,
      durationMinutes: 15,
    };
    const isolated = {
      ...value.blocks[0],
      id: "55555555-5555-4555-8555-555555555555",
      startMinutes: -20,
      durationMinutes: 20,
    };
    const tracks = maskPlanTracks([...value.blocks, overlapping, isolated]);
    expect(tracks.get(blockId)).toEqual({ track: 0, count: 2 });
    expect(tracks.get(secondBlock)).toEqual({ track: 1, count: 2 });
    expect(tracks.get(isolated.id)).toEqual({ track: 0, count: 1 });
  });
  it("splits printable plans across time and staff groups without losing either boundary", () => {
    const value = plan();
    value.windowMinutes = 120;
    value.lanes = Array.from({ length: 6 }, () => ({ ...value.lanes[0], id: crypto.randomUUID() }));
    value.blocks = [];
    const pages = maskPlanPrintSegments(value, 12, 4);
    expect(pages).toHaveLength(4);
    expect(pages.map((page) => [page.start, page.end, page.lanes.length])).toEqual([
      [-120, -60, 4],
      [-60, 0, 4],
      [-120, -60, 2],
      [-60, 0, 2],
    ]);
  });
  it("lets normal team members create and edit production plans", () => {
    expect(canManageRecord({ id: "member", role: "user" }, "maskPlans")).toBe(true);
    expect(
      canManageRecord({ id: "member", role: "user" }, "maskPlans", {
        createdBy: "colleague",
        data: plan(),
      }),
    ).toBe(true);
  });
});

describe("batched mask-plan actor references", () => {
  const context = { departmentId: "department" } as Context;
  function transaction(rows: { id: string; kind: string; actorId?: string }[]) {
    const where = vi.fn(async () => rows);
    const select = vi.fn(() => ({ from: () => ({ where }) }));
    return { tx: { select } as unknown as Transaction, select };
  }
  it("validates all repeated actor links in one query", async () => {
    const value = plan();
    value.blocks = Array.from({ length: 20 }, () => ({
      ...value.blocks[0],
      id: crypto.randomUUID(),
    }));
    const { tx, select } = transaction([
      { id: "actor", kind: "actors" },
      { id: "casting", kind: "casting", actorId: "actor" },
    ]);
    await validateMaskPlanActors(context, value, tx);
    expect(select).toHaveBeenCalledOnce();
  });
  it("does not query the actor catalog for free-text blocks", async () => {
    const value = plan();
    value.blocks[0].actorIds = [];
    value.blocks[0].actorNames = ["Gast"];
    const { tx, select } = transaction([]);
    await validateMaskPlanActors(context, value, tx);
    expect(select).not.toHaveBeenCalled();
  });
  it("rejects missing actors and actors outside this production's casting", async () => {
    await expect(validateMaskPlanActors(context, plan(), transaction([]).tx)).rejects.toThrow(
      "Katalog",
    );
    await expect(
      validateMaskPlanActors(
        context,
        plan(),
        transaction([
          { id: "actor", kind: "actors" },
          { id: "cast", kind: "casting", actorId: "other" },
        ]).tx,
      ),
    ).rejects.toThrow("Besetzung");
  });
});
