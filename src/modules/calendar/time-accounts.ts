import type { DomainRecord, Member } from "@/shared/contracts";
import { isActiveStaff } from "@/shared/client-members";
import { sortCalendarStaff } from "@/shared/calendar-team";
import { shiftDate } from "@/shared/client-api";
import { currentWorkingSchedule } from "@/shared/working-time";
import { calculateAttendanceBalance } from "@/modules/time-tracking/balance";
import { isoWeek } from "@/modules/time-tracking/history";
import { localDay } from "@/modules/time-tracking/rules";

export interface CalendarTimeAccount {
  member: Member;
  state: "ready" | "unconfigured" | "future";
  balanceSeconds?: number;
  weeklySeconds?: number;
  availableFrom?: string;
}
export type AccountSort = "team" | "balance-asc" | "balance-desc";

/** Reuse the personal account rules and cached workspace data, never calendar filters. */
export function calendarTimeAccounts({
  user,
  members,
  attendance,
  events,
  calendarCategories,
  leave,
  now,
}: {
  user: Member;
  members: Member[];
  attendance: DomainRecord[];
  events: DomainRecord[];
  calendarCategories: DomainRecord[];
  leave: DomainRecord[];
  now: Date;
}) {
  const today = localDay(now);
  const week = isoWeek(today);
  const through = week.end === today ? today : shiftDate(week.start, -1);
  if (user.role === "user") return { through, accounts: [] as CalendarTimeAccount[] };
  const accounts = sortCalendarStaff(members.filter(isActiveStaff)).map(
    (member): CalendarTimeAccount => {
      const settings = (member.id === user.id ? user : member).preferences?.workingTime;
      const start = settings?.schedules.map((schedule) => schedule.effectiveFrom).sort()[0];
      if (!settings || !start) return { member, state: "unconfigured" };
      if (start > today) return { member, state: "future", availableFrom: start };
      const balance = calculateAttendanceBalance({
        userId: member.id,
        settings,
        attendance,
        events,
        calendarCategories,
        leave,
        now,
      });
      return {
        member,
        state: "ready",
        balanceSeconds: balance.completed.balanceSeconds,
        weeklySeconds: (currentWorkingSchedule(settings, today)?.weeklyMinutes || 0) * 60,
      };
    },
  );
  return { through, accounts };
}

export function sortTimeAccounts(accounts: readonly CalendarTimeAccount[], sort: AccountSort) {
  return [...accounts].sort((a, b) => {
    if (sort === "team") return 0;
    if (a.state !== "ready" || b.state !== "ready")
      return a.state === "ready" ? -1 : b.state === "ready" ? 1 : 0;
    return ((a.balanceSeconds || 0) - (b.balanceSeconds || 0)) * (sort === "balance-desc" ? -1 : 1);
  });
}
