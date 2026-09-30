import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

/** Scope an already-authorized collection. This helper never grants access or fetches records. */
export function selectExportRecords(
  input: Pick<ExportInput, "kind" | "records" | "teamOnly" | "productionId" | "userIds">,
): DomainRecord[] {
  if (input.teamOnly && input.kind !== "tasks")
    throw new Error("Der Teamboard-Filter ist ausschließlich für Aufgaben verfügbar.");
  if (input.teamOnly && input.productionId)
    throw new Error("Teamboard und Produktionsfilter können nicht kombiniert werden.");
  return input.records.filter((record) => {
    if (
      input.kind !== "backup" &&
      record.kind !== (input.kind === "calendar" ? "events" : input.kind)
    )
      return false;
    if (input.teamOnly && record.data.productionId) return false;
    if (input.userIds?.length) {
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
