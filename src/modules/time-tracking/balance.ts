import type { DomainRecord } from "@/shared/contracts";
import { shiftDate, timeAllocations } from "@/shared/client-api";
import type { WorkingTimeSettings } from "@/shared/working-time";
import { calendarCategoryCreditsTime } from "@/shared/calendar-categories";
import { localDay } from "./rules";
import { timeDayMarkers } from "./day-markers";
import { isoWeek } from "./history";

export interface AttendanceBalanceAmounts {
  attendanceSeconds: number;
  creditSeconds: number;
  targetSeconds: number;
  openingBalanceSeconds: number;
  balanceSeconds: number;
}

export interface AttendanceBalanceWeek extends AttendanceBalanceAmounts {
  start: string;
  end: string;
  number: number;
  year: number;
  completed: boolean;
}

export interface AttendanceBalance extends AttendanceBalanceAmounts {
  from: string;
  to: string;
  weeks: AttendanceBalanceWeek[];
  completed: AttendanceBalanceAmounts;
}

const emptyAmounts = (): AttendanceBalanceAmounts => ({
  attendanceSeconds: 0,
  creditSeconds: 0,
  targetSeconds: 0,
  openingBalanceSeconds: 0,
  balanceSeconds: 0,
});

/** Assign each whole week to its Monday's month, without overlapping adjacent months. */
export function attendanceMonthRange(month: string) {
  const firstDay = `${month}-01`;
  let first = isoWeek(firstDay).start;
  if (first < firstDay) first = shiftDate(first, 7);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
    .toISOString()
    .slice(0, 10);
  return { from: first, to: isoWeek(lastDay).end };
}

/** Compare complete weekly quotas with saved attendance; never prorate for elapsed days. */
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
  const requestedFirst = from ? isoWeek(from).start : start;
  const first = requestedFirst > start ? requestedFirst : start;
  const requestedLast = isoWeek(to || today).end;
  const last = requestedLast < today ? requestedLast : today;
  const openingBalanceSeconds =
    schedules.length && includeOpeningBalance && first <= start && last >= start
      ? settings.openingBalanceSeconds
      : 0;
  const result: AttendanceBalance = {
    ...emptyAmounts(),
    from: first,
    to: last,
    openingBalanceSeconds,
    weeks: [],
    completed: { ...emptyAmounts(), openingBalanceSeconds, balanceSeconds: openingBalanceSeconds },
  };
  if (!schedules.length || first > last) return result;
  const actual = new Map<string, number>();
  for (const record of attendance) {
    if (record.kind !== "attendance" || record.data.userId !== userId) continue;
    // Saving a booking confirms its net duration; today counts as a complete day.
    // For overnight bookings, only allocations through today enter the balance.
    const allocations = timeAllocations(record.data);
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
  const categoryDefinitions = new Map(
    calendarCategories.map((category) => [String(category.data.key), category.data]),
  );
  const paidDays = new Set(
    timeDayMarkers({
      events: events.filter(
        (event) =>
          calendarCategoryCreditsTime(
            String(event.data.category),
            categoryDefinitions.get(String(event.data.category)),
          ) &&
          (!event.data.leaveId || approvedLeave.has(String(event.data.leaveId))),
      ),
      calendarCategories,
      userId,
      from: first,
      to: last,
    }).map((marker) => marker.date),
  );
  let scheduleIndex = -1;
  for (
    let weekStart = isoWeek(first).start;
    weekStart <= last;
    weekStart = shiftDate(weekStart, 7)
  ) {
    const identity = isoWeek(weekStart);
    const week: AttendanceBalanceWeek = {
      ...identity,
      ...emptyAmounts(),
      completed: identity.end <= today,
    };
    // Seven calendar-day shares only handle an account start or contract change
    // within a week. A regular week always gets its full quota, even on Monday.
    for (let date = identity.start; date <= identity.end; date = shiftDate(date, 1)) {
      while (schedules[scheduleIndex + 1] && schedules[scheduleIndex + 1].effectiveFrom <= date)
        scheduleIndex++;
      const schedule = schedules[scheduleIndex];
      if (!schedule || date < first) continue;
      week.targetSeconds += (schedule.weeklyMinutes * 60) / 7;
      if (date > last) continue;
      week.attendanceSeconds += actual.get(date) || 0;
      // Flexible workdays: a personal paid date counts once, including Sundays.
      // The six-day divisor is independent of weekday choices and actual work.
      if (paidDays.has(date)) week.creditSeconds += (schedule.weeklyMinutes * 60) / 6;
    }
    week.attendanceSeconds = Math.round(week.attendanceSeconds);
    week.creditSeconds = Math.round(week.creditSeconds);
    week.targetSeconds = Math.round(week.targetSeconds);
    week.balanceSeconds = week.attendanceSeconds + week.creditSeconds - week.targetSeconds;
    result.weeks.push(week);
    for (const summary of week.completed ? [result, result.completed] : [result]) {
      summary.attendanceSeconds += week.attendanceSeconds;
      summary.creditSeconds += week.creditSeconds;
      summary.targetSeconds += week.targetSeconds;
    }
  }
  for (const summary of [result, result.completed])
    summary.balanceSeconds =
      summary.openingBalanceSeconds +
      summary.attendanceSeconds +
      summary.creditSeconds -
      summary.targetSeconds;
  return result;
}

export function signedHours(seconds: number) {
  return `${seconds > 0 ? "+" : seconds < 0 ? "−" : ""}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Math.abs(seconds) / 3600)}`;
}
