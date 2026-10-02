import type { DomainRecord, Member, RecordData } from "@/shared/contracts";
import { textValue } from "@/shared/contracts";
import { maskPlanSchema, type MaskPlanData, type MaskPlanBlock, type MaskPlanLane } from "./schema";
export type { MaskPlanData, MaskPlanBlock, MaskPlanLane } from "./schema";

export const maskPlanValue = (data: RecordData): MaskPlanData => maskPlanSchema.parse(data);
export function newMaskPlan(productionId: string): MaskPlanData {
  return {
    productionId,
    title: "Maskenplan",
    notes: "",
    windowMinutes: 60,
    stepMinutes: 5,
    lanes: [],
    blocks: [],
  };
}
export function maskPlanWindow(plan: MaskPlanData) {
  const earliest = Math.min(-plan.windowMinutes, ...plan.blocks.map((block) => block.startMinutes));
  const start = Math.floor(earliest / plan.stepMinutes) * plan.stepMinutes;
  return {
    start,
    end: 0,
    ticks: Array.from(
      { length: -start / plan.stepMinutes + 1 },
      (_, index) => start + index * plan.stepMinutes,
    ),
  };
}
export function maskPlanStaffNames(lane: MaskPlanLane, members: Member[]) {
  const names = lane.memberIds.map(
    (id) => members.find((member) => member.id === id)?.name || "Unbekannte Maskenperson",
  );
  return [...new Set([...names, ...lane.staffNames])];
}
export function maskPlanActorNames(block: MaskPlanBlock, actors: DomainRecord[]) {
  const names = block.actorIds.map((id) =>
    textValue(actors.find((actor) => actor.id === id)?.data.name, "Unbekannte Schauspielperson"),
  );
  return [...new Set([...names, ...block.actorNames])];
}
export function maskPlanBlockLabel(block: MaskPlanBlock, actors: DomainRecord[]) {
  return [maskPlanActorNames(block, actors).join(" / "), block.title].filter(Boolean).join(" · ");
}
export function maskPlanClock(offset: number, performanceTime: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(performanceTime)) return "";
  const [hours, minutes] = performanceTime.split(":").map(Number);
  const total = hours * 60 + minutes + offset;
  const clock = ((total % 1440) + 1440) % 1440;
  const day = Math.floor(total / 1440);
  return `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}${day === -1 ? " (Vortag)" : day < -1 ? ` (${Math.abs(day)} Tage vorher)` : ""}`;
}
export function maskPlanOverlaps(plan: MaskPlanData) {
  const result: { firstId: string; secondId: string; reason: "lane" | "staff" | "actor" }[] = [];
  const staff = new Map(plan.lanes.map((lane) => [lane.id, lane.memberIds]));
  for (let first = 0; first < plan.blocks.length; first++) {
    for (let second = first + 1; second < plan.blocks.length; second++) {
      const left = plan.blocks[first],
        right = plan.blocks[second];
      if (
        left.startMinutes >= right.startMinutes + right.durationMinutes ||
        right.startMinutes >= left.startMinutes + left.durationMinutes
      )
        continue;
      const reason =
        left.laneId === right.laneId
          ? "lane"
          : left.actorIds.some((id) => right.actorIds.includes(id))
            ? "actor"
            : (staff.get(left.laneId) || []).some((id) => staff.get(right.laneId)?.includes(id))
              ? "staff"
              : null;
      if (reason) result.push({ firstId: left.id, secondId: right.id, reason });
    }
  }
  return result;
}
export function cloneMaskPlan(plan: MaskPlanData, productionId = plan.productionId): MaskPlanData {
  const laneIds = new Map(plan.lanes.map((lane) => [lane.id, crypto.randomUUID()]));
  return {
    ...plan,
    productionId,
    lanes: plan.lanes.map((lane) => ({
      ...lane,
      id: laneIds.get(lane.id)!,
      memberIds: [...lane.memberIds],
      staffNames: [...lane.staffNames],
    })),
    blocks: plan.blocks.map((block) => ({
      ...block,
      id: crypto.randomUUID(),
      laneId: laneIds.get(block.laneId)!,
      actorIds: [...block.actorIds],
      actorNames: [...block.actorNames],
    })),
  };
}
