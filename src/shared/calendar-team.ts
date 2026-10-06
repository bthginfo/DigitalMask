import { isActiveStaff } from "./client-members";
import type { Member } from "./contracts";

export const calendarGuestLane = { id: "", name: "Gäste/Aushilfen" };
const normalizedName = (name: string) =>
  name.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
function staffRank(name: string) {
  const normalized = normalizedName(name);
  const first = normalized.split(" ")[0];
  if (first === "laura") return 0;
  if (first === "katharina") return 1;
  if (first === "janine") return 2;
  if (normalized === "julia gottlober" || normalized === "julia gottloeber") return 3;
  if (normalized === "julia john") return 4;
  if (first === "magdalena") return 5;
  return 6;
}

/** The same stable department order is used in the planner, pickers and team exports. */
export function sortCalendarStaff(members: Member[]) {
  return [...members].sort(
    (a, b) =>
      staffRank(a.name) - staffRank(b.name) ||
      normalizedName(a.name).localeCompare(normalizedName(b.name), "de") ||
      a.id.localeCompare(b.id),
  );
}

export function calendarTeamLanes(
  members: Member[],
  people?: string[],
  includeGuests = true,
): Pick<Member, "id" | "name">[] {
  const staff = sortCalendarStaff(
    members.filter((member) => isActiveStaff(member) && (!people || people.includes(member.id))),
  );
  return includeGuests ? [...staff, calendarGuestLane] : staff;
}
