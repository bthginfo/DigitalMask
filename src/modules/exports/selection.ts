import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";
import { recordMatchesPeriod } from "../../shared/period-filter";

/** Scope an already-authorized collection. This helper never grants access or fetches records. */
export function selectExportRecords(
  input: Pick<
    ExportInput,
    | "kind"
    | "records"
    | "teamOnly"
    | "generalOnly"
    | "productionId"
    | "userIds"
    | "year"
    | "season"
    | "references"
  >,
): DomainRecord[] {
  if (input.teamOnly && input.kind !== "tasks")
    throw new Error("Der Teamboard-Filter ist ausschließlich für Aufgaben verfügbar.");
  if (input.teamOnly && input.productionId)
    throw new Error("Teamboard und Produktionsfilter können nicht kombiniert werden.");
  if (input.generalOnly && (!["messages", "looks"].includes(input.kind) || input.productionId))
    throw new Error(
      "Der Allgemeinfilter ist nur für Nachrichten und Aufschriebe ohne Produktion verfügbar.",
    );
  return input.records.filter((record) => {
    if (input.kind === "people" && record.data.linkedMemberId) return false;
    if (
      input.kind !== "backup" &&
      record.kind !== (input.kind === "calendar" ? "events" : input.kind)
    )
      return false;
    if (input.teamOnly && record.data.productionId) return false;
    if (input.generalOnly && (record.data.productionId || record.data.conversationId)) return false;
    if (!recordMatchesPeriod(record, input, input.references?.productions || [])) return false;
    if (input.userIds !== undefined) {
      if (
        record.kind === "events" &&
        !(
          Array.isArray(record.data.participantIds) &&
          record.data.participantIds.some((id) => input.userIds!.includes(String(id)))
        )
      )
        return false;
      if (
        ["time", "attendance"].includes(record.kind) &&
        !input.userIds.includes(String(record.data.userId))
      )
        return false;
    }
    if (input.productionId)
      return record.kind === "productions"
        ? record.id === input.productionId
        : record.data.productionId === input.productionId;
    return true;
  });
}
