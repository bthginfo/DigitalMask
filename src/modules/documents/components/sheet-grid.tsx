import type { RefObject } from "react";
import type { SheetInfo } from "../contracts";
import { columnName } from "../sheet-values";
import {
  sheetCellPresentation,
  sheetColumnWidth,
  sheetRowHeight,
  visibleSheetCell,
  type SheetDirection,
  type SheetLayout,
  type SheetPosition,
} from "../sheet-layout";

const movements: Record<string, SheetDirection> = {
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export function SheetGrid({
  sheet,
  columns,
  first,
  last,
  layout,
  selected,
  grid,
  display,
  onSelect,
  onNavigate,
  onPaste,
}: {
  sheet: SheetInfo;
  columns: number;
  first: number;
  last: number;
  layout: SheetLayout;
  selected: SheetPosition;
  grid: RefObject<HTMLDivElement | null>;
  display: (row: number, column: number) => string;
  onSelect: (row: number, column: number, edit?: boolean) => void;
  onNavigate: (direction: SheetDirection) => void;
  onPaste: (event: React.ClipboardEvent) => void;
}) {
  const width =
    44 +
    Array.from({ length: columns }, (_, c) => sheetColumnWidth(sheet, c + 1)).reduce(
      (a, b) => a + b,
      0,
    );
  return (
    <div ref={grid} className="sheet-grid-scroll" onPaste={onPaste}>
      <table className="shared-sheet-grid" aria-label={sheet.name || "Tabelle"} style={{ width }}>
        <colgroup>
          <col style={{ width: 44 }} />
          {Array.from({ length: columns }, (_, c) => (
            <col key={c} style={{ width: sheetColumnWidth(sheet, c + 1) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sheet-corner" aria-label="Zeile" />
            {Array.from({ length: columns }, (_, c) => (
              <th scope="col" key={c}>
                {columnName(c + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
            const row = first + offset;
            return (
              <tr key={row} style={{ height: sheetRowHeight(sheet, row) }}>
                <th scope="row">{row}</th>
                {Array.from({ length: columns }, (_, c) => {
                  const visible = visibleSheetCell(layout, row, c + 1, first, last);
                  if (!visible) return null;
                  const { master } = visible;
                  const contents = display(master.row, master.column);
                  const active = selected.row === master.row && selected.column === master.column;
                  const presentation = sheetCellPresentation(sheet, visible);
                  const rangeLabel = visible.range
                    ? `, verbunden bis ${columnName(visible.range.last.column)}${visible.range.last.row}`
                    : "";
                  return (
                    <td
                      key={c}
                      rowSpan={visible.rowSpan}
                      colSpan={visible.colSpan}
                      className={active ? "selected" : ""}
                      style={presentation.cell}
                    >
                      <button
                        type="button"
                        className="sheet-cell"
                        style={presentation.content}
                        data-cell={`${master.row}:${master.column}`}
                        tabIndex={active ? 0 : -1}
                        aria-label={`Zelle ${columnName(master.column)}${master.row}${contents ? `: ${contents}` : ""}${rangeLabel}`}
                        aria-pressed={active}
                        title={contents || undefined}
                        onClick={() => onSelect(row, c + 1)}
                        onDoubleClick={() => onSelect(row, c + 1, true)}
                        onKeyDown={(event) => {
                          if (movements[event.key]) {
                            event.preventDefault();
                            onNavigate(movements[event.key]);
                          } else if (event.key === "Enter" || event.key === "F2") {
                            event.preventDefault();
                            onSelect(row, c + 1, true);
                          }
                        }}
                      >
                        <span className="sheet-cell-content">
                          {contents || <span aria-hidden="true">&nbsp;</span>}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
