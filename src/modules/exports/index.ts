import { buildCsv, buildXlsx } from "./spreadsheet";
import { buildIcs } from "./ical";
import { expandCalendar } from "./calendar";
import { expandTime } from "./time";
import type { ExportInput, ExportResult } from "./types";
import { selectExportRecords } from "./selection";
import { resolveProductionContacts } from "./contacts";
import { durationSummary } from "./duration-summary";
import { exportRows } from "./data";
import { documentPresentation } from "./document-presentation";
import { seasonBounds } from "../../shared/period-filter";
export type { ExportInput, ExportResult, ExportFormat } from "./types";
export { selectExportRecords } from "./selection";

/** Input must already be authorized and filtered. No database or remote asset calls. */
export async function buildExport(input: ExportInput): Promise<ExportResult> {
  const formats = ["pdf", "xlsx", "csv", "ics", "json"];
  if (!formats.includes(input.format)) throw new Error("Unbekanntes Exportformat.");
  input = { ...input, records: selectExportRecords(input) };
  const season = seasonBounds(input.season);
  if (season && ["events", "calendar", "time", "attendance"].includes(input.kind)) {
    const last = `${Number(season.to.slice(0, 4))}-07-31`;
    input = {
      ...input,
      from: input.from && input.from > season.from ? input.from : season.from,
      to: input.to && input.to < last ? input.to : last,
    };
    if (input.from! > input.to!) input = { ...input, records: [], from: season.from, to: last };
  }
  if (input.year && ["events", "calendar", "time", "attendance"].includes(input.kind)) {
    const first = `${input.year}-01-01`,
      last = `${input.year}-12-31`;
    input = {
      ...input,
      from: input.from && input.from > first ? input.from : first,
      to: input.to && input.to < last ? input.to : last,
    };
    if (input.from! > input.to!) input = { ...input, records: [], from: first, to: last };
  }
  if (input.records.length > 20000)
    throw new Error("Bitte die Exportauswahl auf höchstens 20.000 Einträge begrenzen.");
  const filename = `digitalmask-${input.teamOnly ? "teamboard" : input.kind.replace(/[^a-zA-Z0-9_-]/g, "-")}${input.from ? `-${input.from.replace(/[^0-9-]/g, "")}` : ""}.${input.format}`;
  if (input.format === "json")
    return {
      bytes: new TextEncoder().encode(
        JSON.stringify(
          {
            schemaVersion: 1,
            organization: input.organization,
            department: input.department,
            kind: input.kind,
            from: input.from,
            to: input.to,
            ...(input.teamOnly ? { teamOnly: true } : {}),
            ...(input.generalOnly ? { generalOnly: true } : {}),
            ...(input.productionId ? { productionId: input.productionId } : {}),
            ...(input.userIds !== undefined ? { userIds: input.userIds } : {}),
            ...(input.year ? { year: input.year } : {}),
            ...(input.season ? { season: input.season } : {}),
            records: input.records,
            ...(["looks", "handovers"].includes(input.kind)
              ? {
                  documentDirectory: input.records.map((record) =>
                    documentPresentation(record, input),
                  ),
                }
              : {}),
            ...(input.kind === "attendance"
              ? {
                  attendanceSummary: (() => {
                    const summary = durationSummary(exportRows(expandTime(input)));
                    return {
                      totalSeconds: summary.total,
                      people: Object.fromEntries(summary.people),
                      days: Object.fromEntries(summary.days),
                      weeks: Object.fromEntries(summary.weeks),
                    };
                  })(),
                }
              : {}),
            ...(input.kind === "productions"
              ? {
                  contactDirectory: input.records.map((record) => ({
                    productionId: record.id,
                    contacts: resolveProductionContacts(
                      record,
                      input.members,
                      input.references?.people,
                    ),
                  })),
                }
              : {}),
          },
          null,
          2,
        ),
      ),
      mime: "application/json; charset=utf-8",
      filename,
    };
  if (input.format === "ics") {
    if (input.kind !== "events" && input.kind !== "calendar")
      throw new Error("ICS ist ausschließlich für Kalenderdaten verfügbar.");
    return { bytes: buildIcs(input), mime: "text/calendar; charset=utf-8", filename };
  }
  if (input.kind === "maskPlans" && ["csv", "xlsx"].includes(input.format)) {
    const { buildMaskPlanCsv, buildMaskPlanXlsx } = await import("../mask-plans/export");
    return input.format === "csv"
      ? { bytes: buildMaskPlanCsv(input), mime: "text/csv; charset=utf-8", filename }
      : {
          bytes: await buildMaskPlanXlsx(input),
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename,
        };
  }
  const normalized =
    input.kind === "events" || input.kind === "calendar"
      ? expandCalendar(input)
      : ["time", "attendance"].includes(input.kind)
        ? expandTime(input)
        : input;
  if (input.format === "csv")
    return { bytes: buildCsv(normalized), mime: "text/csv; charset=utf-8", filename };
  if (input.format === "xlsx")
    return {
      bytes: await buildXlsx(normalized),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename,
    };
  const { buildPdf } = await import("./pdf");
  return { bytes: await buildPdf(normalized), mime: "application/pdf", filename };
}
export default buildExport;
