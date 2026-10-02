import { z } from "zod";

const referenceIds = z.array(z.string().min(1).max(100)).max(100).default([]);
const names = z.array(z.string().trim().min(1).max(200)).max(100).default([]);
const lane = z.object({
  id: z.uuid(),
  label: z.string().trim().max(200).default(""),
  memberIds: referenceIds,
  staffNames: names,
});
const block = z.object({
  id: z.uuid(),
  laneId: z.uuid(),
  startMinutes: z.number().int().min(-720).max(-1),
  durationMinutes: z.number().int().min(1).max(720),
  actorIds: referenceIds,
  actorNames: names,
  title: z.string().trim().max(500).default(""),
  notes: z.string().max(4000).default(""),
  color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal("")]).default(""),
});
export const maskPlanSchema = z
  .object({
    productionId: z.string().min(1, "Bitte wähle eine Produktion.").max(100),
    title: z.string().trim().min(1, "Bitte gib dem Maskenplan einen Namen.").max(200),
    notes: z.string().max(4000).default(""),
    windowMinutes: z.number().int().min(5).max(720).default(60),
    stepMinutes: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15)]).default(5),
    lanes: z.array(lane).max(24).default([]),
    blocks: z.array(block).max(250).default([]),
  })
  .superRefine((plan, context) => {
    const laneIds = new Set(plan.lanes.map((item) => item.id));
    if (new Set(plan.lanes.flatMap((item) => item.memberIds)).size > 100)
      context.addIssue({
        code: "custom",
        path: ["lanes"],
        message: "Ein Maskenplan kann höchstens 100 Maskenpersonen enthalten.",
      });
    if (new Set(plan.blocks.flatMap((item) => item.actorIds)).size > 100)
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "Ein Maskenplan kann höchstens 100 Schauspielpersonen enthalten.",
      });
    if (laneIds.size !== plan.lanes.length)
      context.addIssue({
        code: "custom",
        path: ["lanes"],
        message: "Spalten benötigen eindeutige IDs.",
      });
    if (new Set(plan.blocks.map((item) => item.id)).size !== plan.blocks.length)
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "Zeitblöcke benötigen eindeutige IDs.",
      });
    plan.blocks.forEach((item, index) => {
      if (!laneIds.has(item.laneId))
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "laneId"],
          message: "Bitte ordne den Zeitblock einer vorhandenen Spalte zu.",
        });
      if (item.startMinutes + item.durationMinutes > 0)
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "durationMinutes"],
          message: "Ein Zeitblock muss spätestens zum Vorstellungsbeginn enden.",
        });
      if (!(item.title || item.actorIds.length || item.actorNames.length))
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "title"],
          message: "Bitte wähle Schauspieler oder trage eine Tätigkeit ein.",
        });
      if (new Set(item.actorIds).size !== item.actorIds.length)
        context.addIssue({
          code: "custom",
          path: ["blocks", index, "actorIds"],
          message: "Eine Schauspielperson darf im selben Block nur einmal vorkommen.",
        });
    });
    plan.lanes.forEach((item, index) => {
      if (new Set(item.memberIds).size !== item.memberIds.length)
        context.addIssue({
          code: "custom",
          path: ["lanes", index, "memberIds"],
          message: "Eine Maskenperson darf in derselben Spalte nur einmal vorkommen.",
        });
    });
  });
export type MaskPlanData = z.infer<typeof maskPlanSchema>;
export type MaskPlanLane = MaskPlanData["lanes"][number];
export type MaskPlanBlock = MaskPlanData["blocks"][number];
