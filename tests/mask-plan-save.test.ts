import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { memberships } from "@/platform/db/schema";
import { maskPlanSchema } from "@/modules/mask-plans/schema";
import { newMaskPlan } from "@/modules/mask-plans/model";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/platform/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/platform/events", () => ({
  auditChange: mocks.audit,
  emit: vi.fn(),
  scheduleEvents: vi.fn(),
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: mocks.invalidate }));
import { saveRecord } from "@/modules/records/service";

const laneId = "11111111-1111-4111-8111-111111111111";
const blockId = "22222222-2222-4222-8222-222222222222";
const context = {
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  user: { id: "editor", role: "user" },
} as Context;
const historicalPlan = () =>
  maskPlanSchema.parse({
    ...newMaskPlan("production"),
    lanes: [{ id: laneId, memberIds: ["former-staff"], staffNames: ["Fiktive Aushilfe"] }],
    blocks: [
      {
        id: blockId,
        laneId,
        startMinutes: -30,
        durationMinutes: 15,
        actorIds: ["former-actor"],
        actorNames: ["Fiktive Gastbesetzung"],
        title: "Vorbereitung",
      },
    ],
  });

function fixture() {
  const timestamp = new Date("2026-10-01T08:00:00Z");
  const row = (
    kind: string,
    id: string,
    data: Record<string, unknown>,
    productionId: string | null = null,
  ) => ({
    kind,
    id,
    data,
    productionId,
    departmentId: context.departmentId,
    organizationId: context.organizationId,
    createdBy: "editor",
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
  const stored = row("maskPlans", "saved-plan", historicalPlan(), "production");
  const production = row("productions", "production", {
    title: "Fiktives Stück",
    memberIds: ["editor"],
  });
  const catalog = [
    row("actors", "former-actor", { name: "Frühere Besetzung" }),
    row("actors", "current-actor", { name: "Aktuelle Besetzung" }),
    row("casting", "cast-current", { actorId: "current-actor" }, "production"),
  ];
  const staff = [
    { id: "former-staff", role: "user", status: "disabled" },
    { id: "new-inactive-staff", role: "user", status: "disabled" },
    { id: "cover-staff", role: "user", status: "active" },
  ];
  const queries: { table: unknown; params: unknown[] }[] = [];
  const update = vi.fn();
  const insert = vi.fn();
  const dialect = new PgDialect();
  const result = <T>(rows: T[]) => ({
    then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    limit: (count: number) => result(rows.slice(0, count)),
    for: () => result(rows),
  });
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          const { params } = dialect.sqlToQuery(condition);
          queries.push({ table, params });
          if (table === memberships)
            return result(
              staff.filter((member) => member.status === "active" && params.includes(member.id)),
            );
          if (params.includes("actors") && params.includes("casting"))
            return result(
              catalog
                .filter((item) =>
                  item.kind === "actors"
                    ? params.includes(item.id)
                    : params.includes(item.productionId),
                )
                .map((item) => ({ ...item, actorId: item.data.actorId })),
            );
          return result(
            [stored, production].filter((item) => item.id === params[0] && item.kind === params[2]),
          );
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            update(values);
            return [{ ...stored, ...values }];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          insert(values);
          return [{ ...stored, ...values, version: 1 }];
        },
      }),
    }),
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { stored, production, queries, update, insert };
}

describe("mask-plan save with historical assignments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a title and time edit after staff leave and casting changes without dropping their assignments", async () => {
    const { stored, update } = fixture();
    const draft = historicalPlan();
    draft.title = "Überarbeiteter Ablauf";
    draft.blocks[0].startMinutes = -40;
    const saved = await saveRecord(context, "maskPlans", draft, stored.id, stored.version);
    expect(saved).toMatchObject({ version: 2, data: draft });
    expect(saved.data.lanes).toEqual(draft.lanes);
    expect(saved.data.blocks).toEqual(draft.blocks);
    expect(stored.data).toEqual(historicalPlan());
    expect(update).toHaveBeenCalledOnce();
  });

  it("still requires new staff to be active and new actors to belong to the production's cast", async () => {
    const { stored, update } = fixture();
    const staffDraft = historicalPlan();
    staffDraft.lanes[0].memberIds.push("new-inactive-staff");
    await expect(saveRecord(context, "maskPlans", staffDraft, stored.id, 1)).rejects.toMatchObject({
      status: 400,
    });
    const actorDraft = historicalPlan();
    actorDraft.blocks.push({ ...actorDraft.blocks[0], id: "33333333-3333-4333-8333-333333333333" });
    await expect(saveRecord(context, "maskPlans", actorDraft, stored.id, 1)).rejects.toThrow(
      "Besetzung",
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts active replacement staff outside the permanent production team and currently cast actors", async () => {
    const { stored } = fixture();
    const draft = historicalPlan();
    draft.lanes[0].memberIds.push("cover-staff");
    draft.blocks[0].actorIds.push("current-actor");
    const saved = await saveRecord(context, "maskPlans", draft, stored.id, 1);
    expect(saved.data).toEqual(draft);
  });

  it("keeps production access checks and stale-version recovery before any writes", async () => {
    const { stored, production, update } = fixture();
    await expect(
      saveRecord(context, "maskPlans", historicalPlan(), stored.id, 2),
    ).rejects.toMatchObject({ status: 409 });
    production.data.memberIds = ["other-editor"];
    await expect(
      saveRecord(context, "maskPlans", historicalPlan(), stored.id, 1),
    ).rejects.toMatchObject({ status: 403 });
    expect(update).not.toHaveBeenCalled();
  });

  it("creates free-text plans and does not accept historical links in new plans", async () => {
    const { insert } = fixture();
    await expect(saveRecord(context, "maskPlans", historicalPlan())).rejects.toMatchObject({
      status: 400,
    });
    const draft = historicalPlan();
    draft.lanes[0].memberIds = [];
    draft.blocks[0].actorIds = [];
    const saved = await saveRecord(context, "maskPlans", draft);
    expect(saved.data).toEqual(draft);
    expect(insert).toHaveBeenCalledOnce();
  });
});
