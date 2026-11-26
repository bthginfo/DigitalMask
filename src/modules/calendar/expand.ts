import type { DomainRecord, Member } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { canManageRecord } from "@/shared/record-permissions";
import { calendarPresentation } from "@/shared/calendar-categories";
import { calendarEventPaint } from "@/shared/calendar-paint";
import { occurrences } from "./occurrences";

export type ExpandedEvent = ReturnType<typeof expandEvents>[number];

/**
 * Calendar instances for a visible range. Kept free of FullCalendar so the Heute screen and
 * other light views can list upcoming services without loading the calendar bundle.
 */
export function expandEvents(
  records: DomainRecord[],
  rangeStart: string,
  rangeEnd: string,
  productions: DomainRecord[] = [],
  categories?: DomainRecord[],
  member?: Member,
  editableProductionIds?: ReadonlySet<string>,
) {
  const from = new Date(rangeStart),
    to = new Date(rangeEnd);
  return records.flatMap((record) => {
    if (
      !Number.isFinite(new Date(value(record.data, "start")).getTime()) ||
      !Number.isFinite(new Date(value(record.data, "end")).getTime())
    )
      return [];
    const instances = occurrences(record, from, to);
    if (!instances.length) return [];
    const presentation = calendarPresentation(record, productions, categories);
    const paint = calendarEventPaint(
      presentation.color,
      presentation.allDay,
      !!presentation.background,
    );
    const editable =
      !record.data.leaveId &&
      !presentation.background &&
      (!record.data.recurrence || record.data.recurrence === "none") &&
      (!member || canManageRecord(member, "events", record)) &&
      (!editableProductionIds ||
        !record.data.productionId ||
        editableProductionIds.has(value(record.data, "productionId")));
    return instances.map((instance) => ({
      id: `${record.id}:${instance.start.toISOString()}`,
      title: presentation.title,
      allDay: presentation.allDay,
      categoryName: presentation.categoryName,
      background: presentation.background,
      blocksTime: presentation.blocksTime,
      start: instance.start.toISOString(),
      end: instance.end.toISOString(),
      ...paint,
      editable,
      extendedProps: { record },
    }));
  });
}
