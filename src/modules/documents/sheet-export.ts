import * as Y from "yjs";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { SHEETS_MAP, cellKey, type DocumentMetadata } from "./contracts";
import { inputValue, excelFormula, createSheetCalculator, displayCell } from "./sheet-values";
import { sheetDimensions } from "./presentation";
import { cellFormatting } from "./sheet-formatting";
import { safeSheetMetadata } from "./format-upgrade";

export async function exportSpreadsheet(
  document: Y.Doc,
  metadata: DocumentMetadata,
  original?: Buffer,
) {
  if (original) {
    const { patchOriginalSpreadsheet } = await import("./office-package");
    return patchOriginalSpreadsheet(original, document, metadata);
  }
  metadata = safeSheetMetadata(document, metadata);
  const workbook = new ExcelJS.Workbook();
  const info = metadata.sheets || [];
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const evaluate = createSheetCalculator(sheets, info);
  for (const sheet of info) {
    const worksheet =
      workbook.worksheets.find((entry) => String(entry.id) === sheet.id) ||
      workbook.addWorksheet(sheet.name);
    const dimension = sheetDimensions(document, sheet);
    if (!original) {
      sheet.widths?.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = Math.max(1, (width - 5) / 7);
      });
      sheet.heights?.forEach((height, index) => {
        worksheet.getRow(index + 1).height = height * 0.75;
      });
      for (const key of Object.keys(sheet.cellStyles || {})) {
        const [row, column] = key.split(":").map(Number);
        if (row < 1 || column < 1 || row > dimension.rows || column > dimension.columns) continue;
        const formatting = cellFormatting(sheet, row, column),
          cell = worksheet.getCell(row, column);
        if (formatting.background)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: `FF${formatting.background.slice(1)}` },
          };
        cell.font = {
          name: formatting.fontFamily,
          size: formatting.fontSize ? formatting.fontSize * 0.75 : undefined,
          color: formatting.color ? { argb: `FF${formatting.color.slice(1)}` } : undefined,
          bold: formatting.bold,
          italic: formatting.italic,
          underline: formatting.underline,
          strike: formatting.strike,
        };
        cell.alignment = {
          horizontal: formatting.horizontal,
          vertical: formatting.vertical,
          wrapText: formatting.wrap,
        };
        for (const side of ["top", "right", "bottom", "left"] as const) {
          const edge = formatting.borders?.[side];
          if (edge)
            cell.border = {
              ...cell.border,
              [side]: {
                color: { argb: `FF${edge.color.slice(1)}` },
                style:
                  edge.style === "double"
                    ? "double"
                    : edge.style === "dashed"
                      ? "dashed"
                      : edge.style === "dotted"
                        ? "dotted"
                        : edge.width >= 3
                          ? "thick"
                          : edge.width >= 2
                            ? "medium"
                            : "thin",
              },
            };
        }
      }
      for (const merge of sheet.merges || []) worksheet.mergeCells(merge);
    }
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
      if (raw.startsWith("=")) {
        const computed = evaluate(sheet.id, row, col);
        const result =
          !evaluate.hasError(sheet.id, row, col) &&
          (typeof computed === "number" ||
            typeof computed === "boolean" ||
            typeof computed === "string")
            ? computed
            : undefined;
        const array = sheet.formulaArrays?.find(
          (entry) => entry.anchor === key && entry.formula === raw,
        );
        const formula: ExcelJS.CellFormulaValue & { shareType?: "array"; ref?: string } = {
          formula: excelFormula(raw),
          result,
          ...(array ? { shareType: "array", ref: array.ref } : {}),
        };
        cell.value = formula;
      } else {
        if (evaluate.arrayAnchor(sheet.id, row, col)) {
          cell.value = null;
          return;
        }
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
