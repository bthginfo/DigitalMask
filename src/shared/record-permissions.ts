import { listValue, type Member, type RecordData, type RecordKind } from "./contracts";

export function canSetCalendarParticipants(member: Pick<Member, "id" | "role">, data: RecordData) {
  const people = listValue(data.participantIds);
  return member.role !== "user" || (people.length === 1 && people[0] === member.id);
}

/** Project visibility and private document access are checked separately on the server. */
export function canManageRecord(
  member: Pick<Member, "id" | "role">,
  kind: RecordKind,
  record?: { createdBy: string; data: RecordData },
) {
  if (["notifications", "timesheets", "files"].includes(kind)) return false;
  if (["categories", "calendarCategories"].includes(kind)) return member.role !== "user";
  if (kind === "events" && record?.data.leaveId) return false;
  if (kind === "events" && record) return canSetCalendarParticipants(member, record.data);
  if (kind === "conversations" && record)
    return record.data.mode === "team" ? member.role !== "user" : record.createdBy === member.id;
  if (kind === "messages" && record?.data.conversationId) return record.data.userId === member.id;
  if (kind === "feedback" && record)
    return member.role === "superadmin" || record.data.userId === member.id;
  if (member.role === "user" && record) {
    if (["time", "attendance", "leave", "messages"].includes(kind))
      return record.data.userId === member.id;
    if (kind === "looks" && record.data.status !== "published")
      return record.createdBy === member.id;
  }
  return true;
}
