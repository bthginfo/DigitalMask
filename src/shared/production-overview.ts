import {
  contactsValue,
  listValue,
  numberValue,
  textValue,
  type DomainRecord,
  type Workspace,
} from "./contracts";
import { calendarProductionReference } from "./calendar-access";

/** Department-wide overview data is separate from access to production work and files. */
export function productionOverviewReference(record: DomainRecord): DomainRecord {
  const reference = calendarProductionReference(record);
  return {
    ...reference,
    data: {
      ...reference.data,
      description: textValue(record.data.description),
      status: textValue(record.data.status),
      memberIds: listValue(record.data.memberIds),
      durationMinutes: numberValue(record.data.durationMinutes),
      contacts: contactsValue(record.data.contacts).map(
        ({ id, role, type, name, memberId, personId }) => ({
          id,
          role,
          type,
          name,
          memberId,
          ...(personId ? { personId } : {}),
        }),
      ),
    },
  };
}

export function productionOverviewRecords(workspace: Workspace): DomainRecord[] {
  return workspace.productionOverview ?? workspace.records.productions;
}
