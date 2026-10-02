import type { MaskPlanBlock, MaskPlanData } from "./schema";
import { maskPlanWindow } from "./model";

/** Overlapping appointments stay beside one another, never hidden underneath. */
export function maskPlanTracks(blocks: MaskPlanBlock[]) {
  const positions = new Map<string, { track: number; count: number }>();
  let group: MaskPlanBlock[] = [];
  let groupEnd = -Infinity;
  const finish = () => {
    const ends: number[] = [];
    for (const block of group) {
      let track = ends.findIndex((end) => end <= block.startMinutes);
      if (track === -1) track = ends.length;
      ends[track] = block.startMinutes + block.durationMinutes;
      positions.set(block.id, { track, count: 0 });
    }
    for (const block of group) positions.get(block.id)!.count = ends.length;
    group = [];
  };
  for (const block of [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id),
  )) {
    if (block.startMinutes >= groupEnd) finish();
    group.push(block);
    groupEnd = Math.max(
      group.length === 1 ? -Infinity : groupEnd,
      block.startMinutes + block.durationMinutes,
    );
  }
  finish();
  return positions;
}

export function maskPlanPrintSegments(plan: MaskPlanData, slotsPerPage: number, lanesPerPage = 4) {
  const { start } = maskPlanWindow(plan);
  const result: {
    lanes: MaskPlanData["lanes"];
    start: number;
    end: number;
    group: number;
    groups: number;
  }[] = [];
  const groups = Math.max(1, Math.ceil(plan.lanes.length / lanesPerPage));
  const slots = Math.max(1, Math.floor(slotsPerPage));
  for (let group = 0; group < groups; group++) {
    for (let offset = start; offset < 0; offset += slots * plan.stepMinutes) {
      result.push({
        lanes: plan.lanes.slice(group * lanesPerPage, (group + 1) * lanesPerPage),
        start: offset,
        end: Math.min(0, offset + slots * plan.stepMinutes),
        group,
        groups,
      });
    }
  }
  return result;
}

export function maskPlanPaleColor(color: string) {
  const value = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : "377a68";
  const channels = [0, 2, 4].map((offset) =>
    Math.round(parseInt(value.slice(offset, offset + 2), 16) * 0.2 + 255 * 0.8)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}
