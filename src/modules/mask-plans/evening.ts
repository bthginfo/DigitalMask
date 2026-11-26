import { listValue, textValue, type DomainRecord } from "@/shared/contracts";
import { occurrences } from "@/modules/calendar/occurrences";
import type { MaskPlanData } from "./schema";

const newest = (left: DomainRecord, right: DomainRecord) =>
  right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);

/** Automatisch: the only plan, otherwise the most recently changed one. */
export function automaticMaskPlan(plans: DomainRecord[]) {
  return plans.length === 1 ? plans[0] : [...plans].sort(newest)[0];
}

/** Preselection in the event editor: a single plan is chosen directly, otherwise automatic. */
export function defaultEventMaskPlanId(plans: DomainRecord[]) {
  return plans.length === 1 ? plans[0].id : "";
}

/** The plan that belongs to this event: its own choice if it still exists, else automatic. */
export function eventMaskPlan(event: DomainRecord | undefined, plans: DomainRecord[]) {
  const productionId = textValue(event?.data.productionId);
  const own = plans.filter((plan) => plan.data.productionId === productionId);
  const chosen = textValue(event?.data.maskPlanId);
  return own.find((plan) => plan.id === chosen) || automaticMaskPlan(own);
}

/** Link from an event to its plan for exactly that evening. */
export function maskPlanEventQuery({
  productionId,
  planId,
  eventId,
  showStart,
}: {
  productionId: string;
  planId?: string;
  eventId?: string;
  showStart?: string;
}) {
  const query = new URLSearchParams({ module: "productions", productionId, tab: "mask-plan" });
  if (planId) query.set("planId", planId);
  if (eventId) query.set("eventId", eventId);
  if (showStart) query.set("showStart", showStart);
  return query;
}

/** Older links carry only the start: find the production's event beginning at that moment. */
export function findShowEvent(events: DomainRecord[], productionId: string, showStart: string) {
  const at = Date.parse(showStart);
  if (!productionId || !Number.isFinite(at)) return undefined;
  return events.find(
    (event) =>
      event.data.productionId === productionId &&
      occurrences(event, new Date(at), new Date(at + 1)).some(
        (item) => item.start.getTime() === at,
      ),
  );
}

export type EveningPerson = {
  id: string;
  status: "planned" | "absent" | "cover";
  /** For a cover: the configured lane member who is not working this evening. */
  replaces?: string;
};
export type EveningLane = { laneId: string; people: EveningPerson[]; mine: boolean };
export type EveningView = {
  lanes: Map<string, EveningLane>;
  /** Lanes with a configured member who is not among the event's participants. */
  absentCount: number;
  /** Configured members who are not working this evening and have no cover in this view. */
  absentIds: string[];
  /** Covers shown in this view (only with replace). */
  covers: { id: string; replaces: string }[];
  /** Participants without a lane this evening (after replacing, if requested). */
  unplaced: string[];
  /** False when the event lists nobody: then nobody is marked as missing. */
  staffed: boolean;
};

/**
 * View-only evening crew. Lanes keep their configured members as the default; absent members
 * are marked and, if requested, replaced in order by participants who are in no lane yet.
 */
export function eveningLanes(
  plan: Pick<MaskPlanData, "lanes">,
  participantIds: string[],
  { replace = false, userId = "" }: { replace?: boolean; userId?: string } = {},
): EveningView {
  const participants = [...new Set(participantIds)];
  const staffed = participants.length > 0;
  const configured = new Set(plan.lanes.flatMap((lane) => lane.memberIds));
  const free = participants.filter((id) => !configured.has(id));
  const lanes = new Map<string, EveningLane>();
  let absentCount = 0;
  for (const lane of plan.lanes) {
    const people: EveningPerson[] = lane.memberIds.map((id) => {
      if (!staffed || participants.includes(id)) return { id, status: "planned" };
      const cover = replace ? free.shift() : undefined;
      return cover ? { id: cover, status: "cover", replaces: id } : { id, status: "absent" };
    });
    if (lane.memberIds.some((id) => staffed && !participants.includes(id))) absentCount++;
    lanes.set(lane.id, {
      laneId: lane.id,
      people,
      mine: !!userId && people.some((person) => person.id === userId && person.status !== "absent"),
    });
  }
  const shown = [...lanes.values()].flatMap((lane) => lane.people);
  return {
    lanes,
    absentCount,
    absentIds: [...new Set(shown.filter((p) => p.status === "absent").map((p) => p.id))],
    covers: shown.flatMap((p) => (p.replaces ? [{ id: p.id, replaces: p.replaces }] : [])),
    unplaced: free,
    staffed,
  };
}

/** Minutes relative to the beginning while "now" lies inside the plan's window, else null. */
export function nowLineMinutes(beginning: number, now: number, windowStart: number) {
  if (!Number.isFinite(beginning) || !Number.isFinite(now)) return null;
  const offset = (now - beginning) / 60000;
  return offset >= windowStart && offset <= 0 ? offset : null;
}

export const eventParticipants = (event: DomainRecord | undefined) =>
  listValue(event?.data.participantIds);
