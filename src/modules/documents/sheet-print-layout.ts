import type { SheetInfo } from "./contracts";
import { cellKey } from "./contracts";
import { createSheetLayout, sheetColumnWidth, sheetRowHeight } from "./sheet-layout";
import { cellFormatting } from "./sheet-formatting";

export interface SheetPrintSegment {
  row: number;
  chunk: number;
  height: number;
}
export interface SheetPrintCell {
  row: number;
  column: number;
  left: number;
  top: number;
  width: number;
  height: number;
  value: string;
}
/** Explicit page geometry keeps blank fills and merged cells together, including page continuations. */
export function sheetPrintPages(
  sheet: SheetInfo,
  columns: number[],
  lastRow: number,
  value: (row: number, column: number) => string,
) {
  const layout = createSheetLayout(sheet, lastRow, Math.max(...columns));
  const totalWidth = columns.reduce((sum, column) => sum + sheetColumnWidth(sheet, column), 0);
  const scale = Math.min(0.75, 744 / totalWidth);
  const widths = columns.map((column) => sheetColumnWidth(sheet, column) * scale);
  const offsets = widths.map((_width, index) =>
    widths.slice(0, index).reduce((sum, width) => sum + width, 0),
  );
  const characterLimits = new Map<string, number>();
  const segments: SheetPrintSegment[] = [];
  for (let row = 1; row <= lastRow; row++) {
    let count = 1;
    for (const column of columns) {
      const range = layout.covered.get(cellKey(row, column));
      if (range && (row !== range.first.row || column !== Math.max(columns[0], range.first.column)))
        continue;
      const master = range?.first || { row, column };
      const formatting = cellFormatting(sheet, master.row, master.column);
      const width = columns.reduce(
        (sum, col, index) =>
          sum +
          (col >= (range?.first.column || column) && col <= (range?.last.column || column)
            ? widths[index]
            : 0),
        0,
      );
      const size = Math.max(4.5, Math.min(72, (formatting.fontSize || 11) * 0.75));
      const limit = Math.max(
        1,
        Math.floor(Math.max(1, width - 8) / (size * 0.65)) *
          Math.max(1, Math.floor(240 / (size * 1.4))),
      );
      characterLimits.set(cellKey(master.row, master.column), limit);
      count = Math.max(count, Math.ceil(value(master.row, master.column).length / limit));
    }
    for (let chunk = 0; chunk < count; chunk++) {
      let height = Math.min(300, sheetRowHeight(sheet, row) * 0.75);
      for (const [index, column] of columns.entries()) {
        const range = layout.covered.get(cellKey(row, column));
        if (
          range &&
          (row !== range.first.row || column !== Math.max(columns[0], range.first.column))
        )
          continue;
        const master = range?.first || { row, column },
          formatting = cellFormatting(sheet, master.row, master.column);
        const limit = characterLimits.get(cellKey(master.row, master.column)) || 800;
        const content = value(master.row, master.column).slice(chunk * limit, (chunk + 1) * limit);
        if (!content) continue;
        const width = range
          ? columns.reduce(
              (sum, col, i) =>
                sum + (col >= range.first.column && col <= range.last.column ? widths[i] : 0),
              0,
            )
          : widths[index];
        const size = Math.max(4.5, Math.min(72, (formatting.fontSize || 11) * 0.75));
        const perLine = Math.max(1, Math.floor(Math.max(1, width - 8) / (size * 0.65)));
        const lines = content
          .split("\n")
          .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
        // Noto's ascender/descender and PDF layout need more room than Excel's compact screen rows.
        height = Math.max(height, Math.min(340, lines * size * 1.5 + 8));
      }
      segments.push({ row, chunk, height });
    }
  }
  const pages: SheetPrintSegment[][] = [];
  let page: SheetPrintSegment[] = [],
    height = 0;
  for (const segment of segments) {
    if (height + segment.height > 445 && page.length) {
      pages.push(page);
      page = [];
      height = 0;
    }
    page.push(segment);
    height += segment.height;
  }
  if (page.length) pages.push(page);
  return pages.map((page) => {
    const tops = page.map((_segment, index) =>
      page.slice(0, index).reduce((sum, entry) => sum + entry.height, 0),
    );
    const cells: SheetPrintCell[] = [];
    const seen = new Set<string>();
    page.forEach((segment, index) =>
      columns.forEach((column, c) => {
        const range = layout.covered.get(cellKey(segment.row, column));
        if (range && column !== Math.max(columns[0], range.first.column)) return;
        const master = range?.first || { row: segment.row, column };
        const key = `${master.row}:${master.column}:${segment.chunk}`;
        if (range && seen.has(key)) return;
        seen.add(key);
        const last = range ? Math.min(columns.at(-1)!, range.last.column) : column;
        const width = widths.slice(c, c + last - column + 1).reduce((sum, entry) => sum + entry, 0);
        const span = range ? page.slice(index).filter((entry) => entry.row <= range.last.row) : [];
        const cellHeight =
          range && segment.chunk === 0 && span.every((entry) => entry.chunk === 0)
            ? span.reduce((sum, entry) => sum + entry.height, 0)
            : segment.height;
        const limit = characterLimits.get(cellKey(master.row, master.column)) || 800;
        cells.push({
          row: master.row,
          column: master.column,
          left: offsets[c],
          top: tops[index],
          width,
          height: cellHeight,
          value: value(master.row, master.column).slice(
            segment.chunk * limit,
            (segment.chunk + 1) * limit,
          ),
        });
      }),
    );
    return {
      segments: page,
      tops,
      cells,
      widths,
      height: page.reduce((sum, segment) => sum + segment.height, 0),
    };
  });
}
