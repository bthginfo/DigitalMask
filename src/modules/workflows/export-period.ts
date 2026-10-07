import { startOfLocalDay } from "@/modules/time-tracking/rules";
import { textValue, type DomainRecord } from "@/shared/contracts";

/** Filter actual reservation/duty times instead of when the request was created. */
export function workflowMatchesExportPeriod(record: DomainRecord, from?: string, to?: string) {
  const start = Date.parse(
    textValue(record.data[record.kind === "shiftSwaps" ? "serviceStart" : "start"]),
  );
  const end = Date.parse(
    textValue(record.data[record.kind === "shiftSwaps" ? "serviceEnd" : "end"]),
  );
  const lower = from ? startOfLocalDay(from).getTime() : -Infinity;
  const next = to ? new Date(`${to}T12:00:00Z`) : undefined;
  next?.setUTCDate(next.getUTCDate() + 1);
  const upper = next ? startOfLocalDay(next.toISOString().slice(0, 10)).getTime() : Infinity;
  return Number.isFinite(start) && Number.isFinite(end) && start < upper && end > lower;
}
