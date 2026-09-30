import { buildCsv, buildXlsx } from "./spreadsheet";
import { buildIcs } from "./ical";
import { expandCalendar } from "./calendar";
import { expandTime } from "./time";
import type { ExportInput, ExportResult } from "./types";
export type { ExportInput, ExportResult, ExportFormat } from "./types";

/** Input must already be authorized and filtered. No database or remote asset calls. */
export async function buildExport(input: ExportInput): Promise<ExportResult> {
  const formats = ["pdf", "xlsx", "csv", "ics", "json"];
  if (!formats.includes(input.format)) throw new Error("Unbekanntes Exportformat.");
  if (input.records.length > 20000)
    throw new Error("Bitte die Exportauswahl auf höchstens 20.000 Einträge begrenzen.");
  const filename = `digitalmask-${input.kind.replace(/[^a-zA-Z0-9_-]/g, "-")}${input.from ? `-${input.from.replace(/[^0-9-]/g, "")}` : ""}.${input.format}`;
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
            records: input.records,
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
  const normalized =
    input.kind === "events" || input.kind === "calendar"
      ? expandCalendar(input)
      : input.kind === "time"
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
