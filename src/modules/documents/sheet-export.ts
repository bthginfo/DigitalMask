import * as Y from "yjs";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { SHEETS_MAP, cellKey, type DocumentMetadata } from "./contracts";
import { inputValue, excelFormula, createSheetCalculator, displayCell } from "./sheet-values";
import { sheetDimensions } from "./presentation";
import { originalCellInput } from "./sheet-import";

export async function exportSpreadsheet(
  document: Y.Doc,
  metadata: DocumentMetadata,
  original?: Buffer,
) {
  const workbook = new ExcelJS.Workbook();
  if (original) await workbook.xlsx.load(original as unknown as ExcelJS.Buffer);
  const info = metadata.sheets || [];
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const evaluate = createSheetCalculator(sheets, info);
  for (const sheet of info) {
    const worksheet =
      workbook.worksheets.find((entry) => String(entry.id) === sheet.id) ||
      workbook.addWorksheet(sheet.name);
    const dimension = sheetDimensions(document, sheet);
    const map = sheets.get(sheet.id);
    map?.forEach((raw, key) => {
      const [row, col] = key.split(":").map(Number);
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 1 ||
        col < 1 ||
        row > dimension.rows ||
        col > dimension.columns
      )
        return;
      const cell = worksheet.getCell(row, col);
      if (cell.isMerged && cell.master.address !== cell.address) return;
      // Preserve rich text, date formats, hyperlinks and other original cell metadata when unchanged.
      if (original && originalCellInput(cell) === raw && !raw.startsWith("=")) return;
      if (raw.startsWith("=")) {
        const computed = evaluate(sheet.id, row, col);
        const result =
          typeof computed === "number" ||
          typeof computed === "boolean" ||
          typeof computed === "string"
            ? computed
            : undefined;
        cell.value = { formula: excelFormula(raw), result };
      } else {
        const value = inputValue(raw);
        cell.value =
          cell.value instanceof Date &&
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? new Date(`${value}T00:00:00.000Z`)
            : value;
      }
    });
    worksheet.pageSetup = {
      ...worksheet.pageSetup,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      orientation: dimension.columns > 6 ? "landscape" : "portrait",
    };
    if (!original) {
      worksheet.columns.forEach((col, i) => {
        col.width = Math.max(10, Math.min(35, (sheet.widths?.[i] || 110) / 7));
      });
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
    }
  }
  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
export function exportSheetCsv(document: Y.Doc, metadata: DocumentMetadata, sheetId?: string) {
  const info = metadata.sheets || [];
  const sheet = info.find((entry) => entry.id === sheetId) || info[0];
  if (!sheet) return "\uFEFF";
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const dimension = sheetDimensions(document, sheet);
  const map = sheets.get(sheet.id);
  const evaluate = createSheetCalculator(sheets, info);
  let rows = 1,
    columns = 1;
  map?.forEach((raw, key) => {
    if (!raw) return;
    const [row, column] = key.split(":").map(Number);
    if (row <= dimension.rows && column <= dimension.columns) {
      rows = Math.max(rows, row);
      columns = Math.max(columns, column);
    }
  });
  const data = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, col) => {
      const raw = map?.get(cellKey(row + 1, col + 1)) || "";
      return raw.startsWith("=")
        ? displayCell(evaluate(sheet.id, row + 1, col + 1))
        : String(inputValue(raw) ?? "");
    }),
  );
  // Prevent downloaded CSV text from being interpreted as an injected spreadsheet formula.
  return `\uFEFF${Papa.unparse(data, { delimiter: ";", escapeFormulae: true, newline: "\r\n" })}`;
}
