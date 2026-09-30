import { defaultCalendarCategories } from "@/shared/calendar-categories";
import { value } from "@/shared/client-api";
import type { Workspace } from "@/shared/contracts";
export function calendarCategories(workspace: Workspace) {
  const records = workspace.records.calendarCategories;
  return records === undefined
    ? [...defaultCalendarCategories]
    : records.map((row) => ({
        key: value(row.data, "key"),
        name: value(row.data, "name"),
        color: value(row.data, "color"),
        allDay: row.data.allDay === true,
      }));
}
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
export function shiftMonth(date: string, delta: number) {
  const current = new Date(`${monthStart(date)}T12:00:00Z`);
  current.setUTCMonth(current.getUTCMonth() + delta);
  return current.toISOString().slice(0, 10);
}
