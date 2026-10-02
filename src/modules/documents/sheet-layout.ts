import type { CSSProperties } from "react";
import { cellKey, type SheetCellStyle, type SheetInfo } from "./contracts";

export interface SheetPosition {
  row: number;
  column: number;
}
export interface SheetRange {
  first: SheetPosition;
  last: SheetPosition;
}
export type SheetDirection = "up" | "down" | "left" | "right";
export interface VisibleSheetCell {
  master: SheetPosition;
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
  range?: SheetRange;
}

function parseAddress(address: string): SheetPosition | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(address);
  if (!match) return null;
  const column = [...match[1].toUpperCase()].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
  const row = Number(match[2]);
  return Number.isSafeInteger(row) && Number.isSafeInteger(column) ? { row, column } : null;
}

/** One bounded index serves rendering, selection, navigation and paste validation. */
export function createSheetLayout(sheet: Pick<SheetInfo, "merges">, rows: number, columns: number) {
  const merges: SheetRange[] = [];
  const covered = new Map<string, SheetRange>();
  for (const address of sheet.merges || []) {
    const parts = address.split(":");
    if (parts.length !== 2) continue;
    const start = parseAddress(parts[0]),
      end = parseAddress(parts[1]);
    if (!start || !end) continue;
    const first = { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) };
    const last = {
      row: Math.min(rows, Math.max(start.row, end.row)),
      column: Math.min(columns, Math.max(start.column, end.column)),
    };
    if (first.row > last.row || first.column > last.column) continue;
    if (merges.some((range) => rangesIntersect(range, { first, last }))) continue;
    const range = { first, last };
    merges.push(range);
    for (let row = first.row; row <= last.row; row++)
      for (let column = first.column; column <= last.column; column++)
        covered.set(cellKey(row, column), range);
  }
  return { merges, covered };
}
export type SheetLayout = ReturnType<typeof createSheetLayout>;

export function sheetMaster(layout: SheetLayout, row: number, column: number): SheetPosition {
  return layout.covered.get(cellKey(row, column))?.first || { row, column };
}

/** A merge continued on a later row page is rendered once with its original master. */
export function visibleSheetCell(
  layout: SheetLayout,
  row: number,
  column: number,
  firstRow: number,
  lastRow: number,
): VisibleSheetCell | null {
  const range = layout.covered.get(cellKey(row, column));
  if (!range) return { master: { row, column }, row, column, rowSpan: 1, colSpan: 1 };
  const visibleRow = Math.max(firstRow, range.first.row);
  if (row !== visibleRow || column !== range.first.column) return null;
  return {
    master: range.first,
    row,
    column,
    rowSpan: Math.min(lastRow, range.last.row) - visibleRow + 1,
    colSpan: range.last.column - range.first.column + 1,
    range,
  };
}

export function nextSheetCell(
  layout: SheetLayout,
  position: SheetPosition,
  direction: SheetDirection,
  rows: number,
  columns: number,
): SheetPosition {
  const master = sheetMaster(layout, position.row, position.column);
  const range = layout.covered.get(cellKey(master.row, master.column));
  let { row, column } = master;
  if (direction === "down") row = (range?.last.row ?? row) + 1;
  if (direction === "up") row--;
  if (direction === "right") column = (range?.last.column ?? column) + 1;
  if (direction === "left") column--;
  return sheetMaster(
    layout,
    Math.max(1, Math.min(rows, row)),
    Math.max(1, Math.min(columns, column)),
  );
}

function rangesIntersect(a: SheetRange, b: SheetRange) {
  return (
    a.first.row <= b.last.row &&
    a.last.row >= b.first.row &&
    a.first.column <= b.last.column &&
    a.last.column >= b.first.column
  );
}

/** Multi-cell paste must be all-or-nothing; covered targets cannot discard values. */
export function pasteIntersectsMerge(
  layout: SheetLayout,
  first: SheetPosition,
  values: string[][],
) {
  if (values.length <= 1 && (values[0]?.length ?? 0) <= 1) return false;
  return values.some((line, offset) => {
    if (!line.length) return false;
    const target = {
      first: { row: first.row + offset, column: first.column },
      last: { row: first.row + offset, column: first.column + line.length - 1 },
    };
    return layout.merges.some((range) => rangesIntersect(range, target));
  });
}

export function sheetColumnWidth(sheet: SheetInfo, column: number) {
  const width = sheet.widths?.[column - 1];
  return width !== undefined && Number.isFinite(width) && width > 0 ? Math.max(8, width) : 64;
}
export function sheetRowHeight(sheet: SheetInfo, row: number) {
  const height = sheet.heights?.[row - 1];
  return height !== undefined && Number.isFinite(height) && height > 0 ? height : 24;
}
function cellStyle(sheet: SheetInfo, row: number, column: number): SheetCellStyle | undefined {
  const index = sheet.cellStyles?.[cellKey(row, column)];
  return index === undefined ? undefined : sheet.styles?.[index];
}

export function sheetCellPresentation(sheet: SheetInfo, visible: VisibleSheetCell) {
  const style = cellStyle(sheet, visible.master.row, visible.master.column);
  const cell: CSSProperties = {
    backgroundColor: style?.background || "#ffffff",
    color: style?.color || "#000000",
    verticalAlign: style?.vertical || "middle",
  };
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
    const key = side.toLowerCase() as "top" | "right" | "bottom" | "left";
    if (visible.range && key === "top" && visible.row > visible.range.first.row) continue;
    if (
      visible.range &&
      key === "bottom" &&
      visible.row + visible.rowSpan - 1 < visible.range.last.row
    )
      continue;
    const perimeter =
      visible.range && (key === "right" || key === "bottom")
        ? cellStyle(
            sheet,
            key === "bottom" ? visible.range.last.row : visible.master.row,
            key === "right" ? visible.range.last.column : visible.master.column,
          )?.borders?.[key]
        : undefined;
    const border = perimeter || style?.borders?.[key];
    if (border) cell[`border${side}`] = `${border.width}px ${border.style} ${border.color}`;
  }
  let height = 0;
  for (let row = visible.row; row < visible.row + visible.rowSpan; row++)
    height += sheetRowHeight(sheet, row);
  const content: CSSProperties = {
    height: Math.max(1, height - 1),
    color: "inherit",
    fontFamily: style?.fontFamily,
    fontSize: style?.fontSize,
    fontWeight: style?.bold ? 700 : 400,
    fontStyle: style?.italic ? "italic" : "normal",
    textDecoration:
      [style?.underline ? "underline" : "", style?.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ") || "none",
    textAlign: style?.horizontal || "left",
    alignItems:
      style?.vertical === "top"
        ? "flex-start"
        : style?.vertical === "bottom"
          ? "flex-end"
          : "center",
    whiteSpace: style?.wrap ? "pre-wrap" : "nowrap",
    overflowWrap: style?.wrap ? "anywhere" : "normal",
  };
  return { cell, content };
}
