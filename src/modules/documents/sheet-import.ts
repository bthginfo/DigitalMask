import * as Y from "yjs";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { HttpError } from "@/platform/http";
import { inspectOfficeArchive } from "./file-policy";
import { themeColors } from "./office-colors";
import { spreadsheetFormatting } from "./sheet-formatting";
import {
  SHEETS_MAP,
  MAX_SHEET_CELLS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  cellKey,
  type SheetInfo,
} from "./contracts";

export function originalCellInput(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("formula" in value) return `=${value.formula}`;
    if ("sharedFormula" in value)
      return cell.formula ? `=${cell.formula}` : String(value.result || "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value) return value.text || value.hyperlink;
    if ("error" in value) return value.error;
  }
  if (
    typeof value === "string" &&
    (/^[=']/.test(value) || /^[+-]?(?:0|[1-9]\d*)(?:[.,]\d+)?$/.test(value))
  )
    return `'${value}`;
  return String(value);
}
export async function importSpreadsheet(bytes: Buffer, csv = false) {
  const document = new Y.Doc();
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const dimensions = document.getMap<{ rows: number; columns: number }>("dimensions");
  const info: SheetInfo[] = [];
  let cells = 0;
  function add(id: string, name: string, rows: number, columns: number) {
    if (rows > MAX_SHEET_ROWS || columns > MAX_SHEET_COLUMNS || info.length >= 12)
      throw new HttpError(
        413,
        "Gemeinsame Tabellen unterstützen bis zu 12 Blätter, 1.000 Zeilen, 100 Spalten und 50.000 gefüllte Zellen. Bitte teile diese Datei auf.",
      );
    const map = new Y.Map<string>();
    sheets.set(id, map);
    info.push({ id, name, rows: Math.max(rows, 40), columns: Math.max(columns, 10) });
    dimensions.set(id, { rows: Math.max(rows, 40), columns: Math.max(columns, 10) });
    return map;
  }
  const warnings = [
    "Zellen, Formeln und Tabellenblätter werden gemeinsam bearbeitet. Zell- und Schriftfarben, einfache Schriftformate, Ausrichtung, Rahmen und verbundene Zellen werden angezeigt. Makros, Diagramm-Bearbeitung und bedingte Formatierungen werden im Editor nicht unterstützt; das Original bleibt verfügbar.",
  ];
  try {
    if (csv) {
      const parsed = Papa.parse<string[]>(new TextDecoder("utf-8").decode(bytes), {
        skipEmptyLines: "greedy",
      });
      if (parsed.errors.length)
        throw new HttpError(
          400,
          "Die CSV-Datei konnte nicht vollständig gelesen werden. Bitte prüfe die Trennzeichen und Anführungszeichen.",
        );
      const columns = Math.max(0, ...parsed.data.map((row) => row.length));
      const map = add("1", "Tabelle 1", parsed.data.length, columns);
      parsed.data.forEach((row, r) =>
        row.forEach((value, c) => {
          if (value) {
            if (++cells > MAX_SHEET_CELLS)
              throw new HttpError(413, "Die Tabelle enthält zu viele gefüllte Zellen.");
            map.set(cellKey(r + 1, c + 1), value);
          }
        }),
      );
    } else {
      const workbook = new ExcelJS.Workbook();
      const palette = themeColors(inspectOfficeArchive(bytes, "sheet")["xl/theme/theme1.xml"]);
      await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
      for (const worksheet of workbook.worksheets) {
        const map = add(
          String(worksheet.id),
          worksheet.name,
          worksheet.rowCount,
          worksheet.columnCount,
        );
        const meta = info.at(-1)!;
        meta.widths = (worksheet.columns || []).map((column) =>
          Math.min(
            600,
            Math.max(
              8,
              Math.round((column.width ?? worksheet.properties.defaultColWidth ?? 8.43) * 7 + 5),
            ),
          ),
        );
        meta.merges = worksheet.model.merges || [];
        Object.assign(meta, spreadsheetFormatting(worksheet, palette));
        worksheet.eachRow((row, r) =>
          row.eachCell((cell, c) => {
            if (cell.isMerged && cell.master.address !== cell.address) return;
            const raw = originalCellInput(cell);
            if (raw) {
              if (++cells > MAX_SHEET_CELLS)
                throw new HttpError(413, "Die Tabelle enthält zu viele gefüllte Zellen.");
              map.set(cellKey(r, c), raw);
            }
          }),
        );
      }
      if (!info.length) add("1", "Tabelle 1", 40, 10);
    }
    return { document, sheets: info, warnings: [...new Set(warnings)] };
  } catch (error) {
    document.destroy();
    throw error;
  }
}
