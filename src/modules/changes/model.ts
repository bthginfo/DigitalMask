import type { DomainRecord, RecordData, RecordKind, Workspace } from "@/shared/contracts";
import { listValue, textValue } from "@/shared/contracts";
import type { FieldChange } from "./contracts";

const names: Partial<Record<RecordKind, string>> = {
  productions: "Produktion",
  actors: "Schauspieler",
  characters: "Figur",
  casting: "Besetzung",
  maskPlans: "Maskenplan",
  tasks: "Aufgabe",
  sprints: "Sprint",
  events: "Kalendereintrag",
  looks: "Aufschrieb",
  templates: "Vorlage",
  materials: "Fundusartikel",
  handovers: "Dienstübergabe",
  time: "Produktionszeit",
  attendance: "Anwesenheit",
  people: "Ansprechperson",
  categories: "Kategorie",
  calendarCategories: "Kalenderart",
  reservations: "Reservierung",
  shiftSwaps: "Diensttausch",
};
export function changeTitle(record: Pick<DomainRecord, "kind" | "data">) {
  return (
    textValue(record.data.title) ||
    textValue(record.data.name) ||
    textValue(record.data.actorName) ||
    names[record.kind] ||
    "Eintrag"
  );
}
const ignored = new Set([
  "idempotencyKey",
  "dayAllocations",
  "templateVersion",
  "biography",
  "sourceId",
  "sourceUrl",
  "portraitSourceUrl",
  "portraitCredit",
  "ensembleProductions",
]);
export function changedFields(before: RecordData = {}, after: RecordData = {}): FieldChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(
      (key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
    .map((key) => ({ key, before: before[key] ?? null, after: after[key] ?? null }));
}

/** Authorisation over the already-filtered workspace; never a query per history row. */
export function visibleChange(record: DomainRecord, workspace: Workspace) {
  if (
    record.departmentId !== workspace.department.id ||
    record.organizationId !== workspace.organization.id
  )
    return false;
  if (
    ["files", "messages", "notifications", "feedback", "conversations", "timesheets"].includes(
      record.kind,
    )
  )
    return false;
  const member = workspace.user;
  const productionId = textValue(record.data.productionId);
  if (productionId && !workspace.records.productions.some((entry) => entry.id === productionId))
    return false;
  if (
    record.kind === "productions" &&
    member.role === "user" &&
    listValue(record.data.memberIds).length &&
    !listValue(record.data.memberIds).includes(member.id)
  )
    return false;
  if (
    ["time", "attendance", "leave"].includes(record.kind) &&
    member.role === "user" &&
    record.data.userId !== member.id
  )
    return false;
  if (
    record.kind === "looks" &&
    record.data.status !== "published" &&
    member.role === "user" &&
    record.createdBy !== member.id
  )
    return false;
  if (
    String(record.kind) === "shiftSwaps" &&
    member.role === "user" &&
    record.data.requesterId !== member.id &&
    record.data.partnerId !== member.id
  )
    return false;
  return true;
}

export function assertUndoState(
  operation: {
    userId: string;
    departmentId: string;
    organizationId: string;
    expiresAt: Date;
    undoneAt: Date | null;
    after: DomainRecord | null;
  },
  userId: string,
  departmentId: string,
  organizationId: string,
  current?: DomainRecord,
  now = new Date(),
) {
  if (
    operation.userId !== userId ||
    operation.departmentId !== departmentId ||
    operation.organizationId !== organizationId
  )
    return "Du kannst nur deinen eigenen letzten Schritt rückgängig machen.";
  if (operation.undoneAt || operation.expiresAt <= now)
    return "Dieser Schritt kann nicht mehr rückgängig gemacht werden.";
  if (operation.after && (!current || current.version !== operation.after.version))
    return "Der Eintrag wurde inzwischen geändert. Die neuere Änderung bleibt erhalten.";
  if (!operation.after && current)
    return "Der Eintrag ist inzwischen wieder vorhanden. Bitte öffne ihn neu.";
  return "";
}
