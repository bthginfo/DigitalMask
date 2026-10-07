import type { DomainRecord } from "@/shared/contracts";
import { shiftDate, timeAllocations } from "@/shared/client-api";
import { currentWorkingSchedule, type WorkingTimeSettings } from "@/shared/working-time";
import { localDay, splitAcrossDays } from "./rules";
import { timeDayMarkers } from "./day-markers";

export interface AttendanceBalance {
  from: string;
  to: string;
  attendanceSeconds: number;
  creditSeconds: number;
  targetSeconds: number;
  openingBalanceSeconds: number;
  balanceSeconds: number;
}

/** A dated target and saved attendance are enough; no timer, polling or project hours needed. */
export function calculateAttendanceBalance({
  userId,
  settings,
  attendance,
  events = [],
  calendarCategories = [],
  leave = [],
  from,
  to,
  includeOpeningBalance = from === undefined,
  now = new Date(),
}: {
  userId: string;
  settings: WorkingTimeSettings;
  attendance: DomainRecord[];
  events?: DomainRecord[];
  calendarCategories?: DomainRecord[];
  leave?: DomainRecord[];
  from?: string;
  to?: string;
  includeOpeningBalance?: boolean;
  now?: Date;
}): AttendanceBalance {
  const schedules = [...settings.schedules].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  const start = schedules[0]?.effectiveFrom || localDay(now);
  const today = localDay(now);
  const first = from && from > start ? from : start;
  const last = to && to < today ? to : today;
  const result: AttendanceBalance = {
    from: first,
    to: last,
    attendanceSeconds: 0,
    creditSeconds: 0,
    targetSeconds: 0,
    openingBalanceSeconds:
      includeOpeningBalance && first <= start && last >= start ? settings.openingBalanceSeconds : 0,
    balanceSeconds: 0,
  };
  if (!schedules.length || first > last) return result;
  const actual = new Map<string, number>();
  for (const record of attendance) {
    if (record.kind !== "attendance" || record.data.userId !== userId) continue;
    let allocations = timeAllocations(record.data);
    const intervalStart = new Date(String(record.data.start || "")).getTime();
    const intervalEnd = new Date(String(record.data.end || "")).getTime();
    if (
      Number.isFinite(intervalStart) &&
      Number.isFinite(intervalEnd) &&
      intervalEnd > now.getTime()
    ) {
      if (intervalStart >= now.getTime()) continue;
      const pause = Math.max(0, Number(record.data.pauseSeconds) || 0);
      if (pause >= (now.getTime() - intervalStart) / 1000) continue;
      allocations = splitAcrossDays(
        new Date(intervalStart).toISOString(),
        now.toISOString(),
        pause,
      );
    }
    for (const day of allocations) {
      if (day.date < first || day.date > last || !Number.isFinite(day.seconds) || day.seconds <= 0)
        continue;
      actual.set(day.date, (actual.get(day.date) || 0) + day.seconds);
    }
  }
  const approvedLeave = new Set(
    leave
      .filter((record) => record.data.userId === userId && record.data.status === "approved")
      .map((record) => record.id),
  );
  const paidDays = new Set(
    timeDayMarkers({
      events: events.filter(
        (event) =>
          ["vacation", "sick"].includes(String(event.data.category)) &&
          (!event.data.leaveId || approvedLeave.has(String(event.data.leaveId))),
      ),
      calendarCategories,
      userId,
      from: first,
      to: last,
    }).map((marker) => marker.date),
  );
  for (let date = first; date <= last; date = shiftDate(date, 1)) {
    const schedule = currentWorkingSchedule({ ...settings, schedules }, date);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const target = schedule?.workingDays.includes(weekday)
      ? (schedule.weeklyMinutes * 60) / schedule.workingDays.length
      : 0;
    const attended = actual.get(date) || 0;
    result.attendanceSeconds += attended;
    result.targetSeconds += target;
    if (paidDays.has(date)) result.creditSeconds += Math.max(0, target - attended);
  }
  result.attendanceSeconds = Math.round(result.attendanceSeconds);
  result.targetSeconds = Math.round(result.targetSeconds);
  result.creditSeconds = Math.round(result.creditSeconds);
  result.balanceSeconds =
    result.openingBalanceSeconds +
    result.attendanceSeconds +
    result.creditSeconds -
    result.targetSeconds;
  return result;
}

export function signedHours(seconds: number) {
  return `${seconds > 0 ? "+" : seconds < 0 ? "−" : ""}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Math.abs(seconds) / 3600)}`;
}
