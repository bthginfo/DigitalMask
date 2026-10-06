import type { DomainRecord, RecordData } from "@/shared/contracts";
import { calendarCategoryBlocksTime, calendarPresentation } from "@/shared/calendar-categories";
import { instantDate, shiftDate, timeAllocations, value } from "@/shared/client-api";
import { dateMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { occurrences } from "@/modules/calendar/occurrences";
import { localDay, startOfLocalDay } from "./rules";

export interface ProposalRange {
  start: string;
  end: string;
}
export interface CalendarTimeProposal extends ProposalRange {
  id: string;
  seconds: number;
  data: RecordData;
  sourceLabels: string[];
  adjusted: boolean;
}
type Interval = { start: number; end: number };
type PlannedInterval = Interval & {
  event: DomainRecord;
  label: string;
  activity: string;
  productionId: string;
};
const absenceKeys = new Set(["absence", "sick", "abf", "rest", "half-day-off", "vacation"]);

function union(ranges: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else if (range.end > range.start) merged.push({ ...range });
  }
  return merged;
}
function subtract(range: Interval, blocked: Interval[]) {
  let remaining = [range];
  for (const occupied of union(blocked))
    remaining = remaining.flatMap((part) => {
      if (occupied.end <= part.start || occupied.start >= part.end) return [part];
      return [
        ...(occupied.start > part.start ? [{ start: part.start, end: occupied.start }] : []),
        ...(occupied.end < part.end ? [{ start: occupied.end, end: part.end }] : []),
      ];
    });
  return remaining;
}
function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && a.end > b.start;
}
function periodParts(range: Interval, period: PeriodFilter) {
  const parts: Interval[] = [];
  let cursor = range.start;
  while (cursor < range.end) {
    const day = localDay(new Date(cursor));
    const stop = Math.min(range.end, startOfLocalDay(shiftDate(day, 1)).getTime());
    if (dateMatchesPeriod(day, period)) parts.push({ start: cursor, end: stop });
    cursor = stop;
  }
  return union(parts);
}

/** Planned intervals are suggestions only. This helper has no storage or mutation side effects. */
export function calendarTimeProposals({
  kind,
  userId,
  week,
  now,
  events,
  bookings,
  productions = [],
  calendarCategories = [],
  timeCategoryKeys = [],
  productionId = "",
  period = {},
  reviewed = [],
}: {
  kind: "attendance" | "time";
  userId: string;
  week: string;
  now: Date;
  events: DomainRecord[];
  bookings: DomainRecord[];
  productions?: DomainRecord[];
  calendarCategories?: DomainRecord[];
  timeCategoryKeys?: string[];
  productionId?: string;
  period?: PeriodFilter;
  reviewed?: ProposalRange[];
}) {
  const from = startOfLocalDay(week);
  const to = startOfLocalDay(shiftDate(week, 7));
  const planned: PlannedInterval[] = [];
  const blockedDays: Interval[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (
      !Array.isArray(event.data.participantIds) ||
      !event.data.participantIds.includes(userId) ||
      !Number.isFinite(instantDate(value(event.data, "start")).getTime()) ||
      !Number.isFinite(instantDate(value(event.data, "end")).getTime())
    )
      continue;
    const presentation = calendarPresentation(event, productions, calendarCategories);
    if (presentation.allDay || absenceKeys.has(value(event.data, "category"))) {
      if (calendarCategoryBlocksTime(value(event.data, "category"), calendarCategories))
        for (const occurrence of occurrences(event, from, to))
          blockedDays.push({ start: occurrence.start.getTime(), end: occurrence.end.getTime() });
      continue;
    }
    if (productionId && event.data.productionId !== productionId) continue;
    for (const occurrence of occurrences(event, from, to)) {
      // A still-running or future service is not evidence of worked hours.
      if (occurrence.end > now || occurrence.end <= occurrence.start) continue;
      const range = {
        start: Math.max(from.getTime(), occurrence.start.getTime()),
        end: Math.min(to.getTime(), occurrence.end.getTime()),
      };
      const activity = value(event.data, "title").trim() || presentation.categoryName;
      for (const part of periodParts(range, period)) {
        const identity = `${part.start}:${part.end}:${value(event.data, "productionId")}:${activity}:${value(event.data, "category")}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        planned.push({
          ...part,
          event,
          label: presentation.title,
          activity,
          productionId: value(event.data, "productionId"),
        });
      }
    }
  }
  const occupied: Interval[] = [...blockedDays];
  let undatedBookings = false;
  for (const record of bookings) {
    if (record.data.userId !== userId) continue;
    const start = value(record.data, "start"),
      end = value(record.data, "end");
    if (start && end) {
      const range = { start: instantDate(start).getTime(), end: instantDate(end).getTime() };
      if (Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start) {
        occupied.push(range);
        continue;
      }
    }
    // A duration without a clock cannot safely establish a free part of that day.
    for (const day of timeAllocations(record.data)) {
      if (day.date >= week && day.date < shiftDate(week, 7) && day.seconds > 0) {
        occupied.push({
          start: startOfLocalDay(day.date).getTime(),
          end: startOfLocalDay(shiftDate(day.date, 1)).getTime(),
        });
        undatedBookings = true;
      }
    }
  }
  for (const range of reviewed) {
    const start = instantDate(range.start).getTime(),
      end = instantDate(range.end).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start)
      occupied.push({ start, end });
  }
  const collisions: Interval[] = [];
  if (kind === "time")
    for (let i = 0; i < planned.length; i++)
      for (let j = i + 1; j < planned.length; j++) {
        const a = planned[i],
          b = planned[j];
        if (overlaps(a, b))
          collisions.push({ start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) });
      }
  const sourceRanges = kind === "attendance" ? union(planned) : planned;
  const proposals: CalendarTimeProposal[] = [];
  for (const source of sourceRanges) {
    const sources = planned.filter((range) => overlaps(source, range));
    for (const range of subtract(source, [...occupied, ...collisions])) {
      const relevant = sources.filter((row) => overlaps(row, range));
      const first = relevant[0];
      if (!first) continue;
      const start = new Date(range.start).toISOString(),
        end = new Date(range.end).toISOString();
      const seconds = Math.floor((range.end - range.start) / 1000);
      if (seconds < 60) continue;
      const category = timeCategoryKeys.includes(value(first.event.data, "category"))
        ? value(first.event.data, "category")
        : first.productionId && timeCategoryKeys.includes("production")
          ? "production"
          : timeCategoryKeys.includes("other")
            ? "other"
            : timeCategoryKeys[0] || "";
      proposals.push({
        id: `${kind}:${start}:${end}:${kind === "time" ? first.productionId + ":" + first.activity : ""}`,
        start,
        end,
        seconds,
        sourceLabels: [...new Set(relevant.map((row) => row.label))],
        adjusted: range.start !== source.start || range.end !== source.end,
        data: {
          title: kind === "attendance" ? "Anwesenheit" : first.activity,
          date: localDay(start),
          start,
          end,
          durationSeconds: seconds,
          pauseSeconds: 0,
          ...(kind === "time" ? { productionId: first.productionId, category } : {}),
        },
      });
    }
  }
  return {
    proposals: proposals.sort((a, b) => a.start.localeCompare(b.start)),
    overlappingEvents: collisions.length > 0,
    undatedBookings,
    blockedDayEvents: planned.some((range) =>
      blockedDays.some((blocked) => overlaps(range, blocked)),
    ),
  };
}
