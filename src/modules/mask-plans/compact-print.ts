import { maskPlanWindow, type MaskPlanData } from "./model";
import { maskPlanTracks } from "./layout";

/** Only a dozen guide ticks; exact appointment boundaries are never rounded. */
export function compactMaskPlanGrid(plan: MaskPlanData) {
  const { start } = maskPlanWindow(plan);
  const interval = Math.max(
    plan.stepMinutes,
    Math.ceil(-start / (12 * plan.stepMinutes)) * plan.stepMinutes,
  );
  const minutes = [start, 0];
  for (let minute = start + interval; minute < 0; minute += interval) minutes.push(minute);
  for (const block of plan.blocks)
    minutes.push(block.startMinutes, block.startMinutes + block.durationMinutes);
  const boundaries = [...new Set(minutes)].sort((a, b) => a - b);
  const columns = plan.lanes.flatMap((lane) => {
    const blocks = plan.blocks.filter((block) => block.laneId === lane.id);
    const positions = maskPlanTracks(blocks);
    const count = Math.max(1, ...[...positions.values()].map((position) => position.count));
    return Array.from({ length: count }, (_, track) => ({
      lane,
      track,
      count,
      blocks: blocks.filter((block) => positions.get(block.id)?.track === track),
    }));
  });
  return { boundaries, columns };
}
