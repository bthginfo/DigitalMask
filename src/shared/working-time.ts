export interface WorkingTimeSchedule {
  effectiveFrom: string;
  weeklyMinutes: number;
  /** JavaScript weekdays: Sunday = 0, Monday = 1. */
  workingDays: number[];
}

export interface WorkingTimeSettings {
  version: number;
  openingBalanceSeconds: number;
  schedules: WorkingTimeSchedule[];
}

export const defaultWorkingDays = [1, 2, 3, 4, 5, 6];
export const workingDayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function currentWorkingSchedule(settings: WorkingTimeSettings | undefined, date: string) {
  return settings?.schedules
    .filter((schedule) => schedule.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

/** Shared server caches may contain the team; the response must still keep targets private. */
export function visibleWorkingTime(
  settings: WorkingTimeSettings | null | undefined,
  ownerId: string,
  viewerId: string,
  viewerRole: "user" | "admin" | "superadmin",
) {
  return settings && (ownerId === viewerId || viewerRole !== "user") ? settings : undefined;
}
