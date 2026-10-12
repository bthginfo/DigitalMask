import { textValue, type DomainRecord, type Workspace } from "./contracts";
import { canManageRecord } from "./record-permissions";

/** Calendar labels are shared with the team without exposing internal production data. */
export function calendarProductionReference(record: DomainRecord): DomainRecord {
  return {
    id: record.id,
    kind: "productions",
    organizationId: record.organizationId,
    departmentId: record.departmentId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    data: {
      title: textValue(record.data.title),
      color: textValue(record.data.color),
      season: textValue(record.data.season),
      premiere: textValue(record.data.premiere),
    },
  };
}

export function calendarProductionRecords(workspace: Workspace): DomainRecord[] {
  return workspace.calendarProductions ?? workspace.records.productions;
}

export function canAccessCalendarProduction(workspace: Workspace, record: DomainRecord) {
  const productionId = textValue(record.data.productionId);
  return !productionId || workspace.records.productions.some((row) => row.id === productionId);
}

export function canEditCalendarEvent(workspace: Workspace, record: DomainRecord) {
  return (
    canManageRecord(workspace.user, "events", record) &&
    canAccessCalendarProduction(workspace, record)
  );
}
