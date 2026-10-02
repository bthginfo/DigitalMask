import type ExcelJS from "exceljs";
import { cellKey, MAX_SHEET_CELLS, type SheetCellStyle, type SheetInfo } from "./contracts";
import { excelColor, safeFontFamily } from "./office-colors";
import { HttpError } from "@/platform/http";

export function spreadsheetFormatting(worksheet: ExcelJS.Worksheet, palette: string[]) {
  const styles: SheetCellStyle[] = [],
    cellStyles: Record<string, number> = {},
    dictionary = new Map<string, number>();
  let count = 0;
  worksheet.eachRow({ includeEmpty: true }, (row, r) => {
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const format: SheetCellStyle = {};
      const { fill, font, alignment, border } = cell;
      if (fill?.type === "pattern" && fill.pattern === "solid")
        format.background = excelColor(fill.fgColor, palette);
      if (font) {
        format.color = excelColor(font.color, palette);
        format.fontSize = font.size ? Math.max(6, Math.min(96, (font.size * 4) / 3)) : undefined;
        format.fontFamily = safeFontFamily(font.name);
        if (font.bold) format.bold = true;
        if (font.italic) format.italic = true;
        if (font.underline) format.underline = true;
        if (font.strike) format.strike = true;
      }
      if (alignment) {
        if (["left", "center", "right", "justify"].includes(alignment.horizontal || ""))
          format.horizontal = alignment.horizontal as SheetCellStyle["horizontal"];
        if (["top", "middle", "bottom"].includes(alignment.vertical || ""))
          format.vertical = alignment.vertical as SheetCellStyle["vertical"];
        if (alignment.wrapText) format.wrap = true;
      }
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const edge = border?.[side];
        if (!edge?.style) continue;
        format.borders ||= {};
        format.borders[side] = {
          color: excelColor(edge.color, palette) || "#000000",
          width: /thick/.test(edge.style) ? 3 : /medium|double/.test(edge.style) ? 2 : 1,
          style:
            edge.style === "double"
              ? "double"
              : /dash/i.test(edge.style)
                ? "dashed"
                : /dot|hair/i.test(edge.style)
                  ? "dotted"
                  : "solid",
        };
      }
      const serialized = JSON.stringify(format);
      if (serialized === "{}") return;
      if (++count > MAX_SHEET_CELLS)
        throw new HttpError(
          413,
          "Die Tabelle enthält zu viele formatierte Zellen. Bitte teile sie auf.",
        );
      let index = dictionary.get(serialized);
      if (index === undefined) {
        index = styles.length;
        styles.push(JSON.parse(serialized));
        dictionary.set(serialized, index);
      }
      cellStyles[cellKey(r, c)] = index;
    });
  });
  return {
    styles,
    cellStyles,
    heights: Array.from({ length: worksheet.rowCount }, (_, i) =>
      Math.max(
        4,
        Math.min(
          400,
          ((worksheet.getRow(i + 1).height || worksheet.properties.defaultRowHeight || 15) * 4) / 3,
        ),
      ),
    ),
  };
}
export function cellFormatting(sheet: SheetInfo, row: number, column: number): SheetCellStyle {
  const index = sheet.cellStyles?.[cellKey(row, column)];
  return index !== undefined ? sheet.styles?.[index] || {} : {};
}
