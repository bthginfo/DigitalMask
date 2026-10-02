"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Redo2, Undo2 } from "lucide-react";
import { ErrorMessage } from "@/components/ui";
import {
  cellKey,
  MAX_SHEET_CELLS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  SHEETS_MAP,
  type SheetInfo,
} from "../contracts";
import { columnName, createSheetCalculator, displayCell } from "../sheet-values";
import {
  createSheetLayout,
  nextSheetCell,
  pasteIntersectsMerge,
  sheetMaster,
  type SheetDirection,
} from "../sheet-layout";
import { SHEET_EDIT } from "../client/shared-document";
import { useDocumentRevision } from "../client/use-document-revision";
import { SheetGrid } from "./sheet-grid";

const PAGE_ROWS = 50;
export function SheetEditor({
  doc,
  info,
  editable,
  onSheetChange,
}: {
  doc: Y.Doc;
  info: SheetInfo[];
  editable: boolean;
  onSheetChange: (id: string) => void;
}) {
  const revision = useDocumentRevision(doc);
  const sheets = useMemo(() => doc.getMap<Y.Map<string>>(SHEETS_MAP), [doc]);
  const dimensions = useMemo(
    () => doc.getMap<{ rows: number; columns: number }>("dimensions"),
    [doc],
  );
  const [sheetId, setSheetId] = useState(info[0]?.id || ""),
    [selection, setSelected] = useState({ row: 1, column: 1 }),
    [rowPage, setPage] = useState(0),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    grid = useRef<HTMLDivElement>(null),
    dirty = useRef(false),
    focusGrid = useRef(false);
  const sheet = info.find((item) => item.id === sheetId) || info[0];
  const current = sheets.get(sheet?.id || "");
  useEffect(() => {
    if (sheet?.id) onSheetChange(sheet.id);
  }, [sheet?.id, onSheetChange]);
  const size = dimensions.get(sheet?.id || "") || sheet || { rows: 1, columns: 1 };
  const rows = Math.min(MAX_SHEET_ROWS, Math.max(1, size.rows)),
    columns = Math.min(MAX_SHEET_COLUMNS, Math.max(1, size.columns));
  const layout = useMemo(
    () => createSheetLayout(sheet || {}, rows, columns),
    [sheet, rows, columns],
  );
  const selected = sheetMaster(
    layout,
    Math.min(rows, selection.row),
    Math.min(columns, selection.column),
  );
  const page = Math.min(rowPage, Math.floor((rows - 1) / PAGE_ROWS));
  const cell = cellKey(selected.row, selected.column),
    raw = current?.get(cell) || "";
  const calculator = useMemo(() => {
    void revision;
    return createSheetCalculator(sheets, info);
  }, [sheets, info, revision]);
  const undo = useMemo(
    () =>
      new Y.UndoManager([sheets, dimensions], {
        trackedOrigins: new Set([SHEET_EDIT]),
        captureTimeout: 500,
      }),
    [sheets, dimensions],
  );
  useEffect(() => () => undo.destroy(), [undo]);
  useEffect(() => {
    if (!dirty.current) setDraft(raw);
  }, [raw, cell, sheetId]);
  useEffect(() => {
    if (!focusGrid.current) return;
    focusGrid.current = false;
    const target = grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cell, page, sheetId]);
  const commit = () => {
    if (!dirty.current || !editable || !current) return;
    doc.transact(() => current.set(cell, draft), SHEET_EDIT);
    dirty.current = false;
  };
  const selectCell = (row: number, column: number, edit = false) => {
    commit();
    dirty.current = false;
    const master = sheetMaster(layout, row, column);
    setSelected(master);
    setDraft(current?.get(cellKey(master.row, master.column)) || "");
    setPage(Math.floor((row - 1) / PAGE_ROWS));
    if (edit) input.current?.focus();
    else if (document.activeElement?.classList.contains("sheet-cell")) focusGrid.current = true;
  };
  const navigate = (direction: SheetDirection) => {
    const next = nextSheetCell(layout, selected, direction, rows, columns);
    selectCell(next.row, next.column);
  };
  const grow = (axis: "rows" | "columns") => {
    if (!sheet || !editable) return;
    commit();
    const next = { rows, columns, [axis]: size[axis] + (axis === "rows" ? 20 : 2) };
    if (
      next.rows > MAX_SHEET_ROWS ||
      next.columns > MAX_SHEET_COLUMNS ||
      next.rows * next.columns > MAX_SHEET_CELLS
    ) {
      setError(
        "Diese Tabelle ist zu groß. Maximal 1.000 Zeilen, 100 Spalten und 50.000 Zellen sind möglich.",
      );
      return;
    }
    doc.transact(() => dimensions.set(sheet.id, next), SHEET_EDIT);
    if (axis === "rows") selectCell(next.rows, selected.column);
  };
  const paste = (event: React.ClipboardEvent) => {
    if (!editable || !current) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n\r]/.test(text)) return;
    event.preventDefault();
    if (text.length > 100000) {
      setError(
        "Die eingefügten Daten sind zu groß. Füge bitte einen kleineren Tabellenbereich ein.",
      );
      return;
    }
    const values = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const endRow = selected.row + values.length - 1,
      endColumn = selected.column + Math.max(...values.map((line) => line.length)) - 1;
    const next = { rows: Math.max(rows, endRow), columns: Math.max(columns, endColumn) };
    if (
      endRow > MAX_SHEET_ROWS ||
      endColumn > MAX_SHEET_COLUMNS ||
      next.rows * next.columns > MAX_SHEET_CELLS
    ) {
      setError(
        "Die eingefügten Daten sind zu groß. Füge bitte einen kleineren Tabellenbereich ein.",
      );
      return;
    }
    if (values.some((line) => line.some((value) => value.length > 4000))) {
      setError(
        "Eine eingefügte Zelle enthält mehr als 4.000 Zeichen. Kürze diesen Zellwert und versuche es erneut.",
      );
      return;
    }
    if (pasteIntersectsMerge(layout, selected, values)) {
      setError(
        "Der eingefügte Bereich enthält verbundene Zellen. Füge die Werte in einen freien Bereich ein oder bearbeite die verbundene Zelle einzeln.",
      );
      return;
    }
    doc.transact(() => {
      values.forEach((line, r) =>
        line.forEach((value, c) =>
          current.set(cellKey(selected.row + r, selected.column + c), value),
        ),
      );
      dimensions.set(sheet!.id, next);
    }, SHEET_EDIT);
    dirty.current = false;
    setDraft(values[0]?.[0] || "");
    setError("");
  };
  const first = page * PAGE_ROWS + 1,
    last = Math.min(rows, first + PAGE_ROWS - 1);
  if (!sheet)
    return (
      <div className="document-loading">
        <strong>Keine Tabellenblätter verfügbar.</strong>
        <p>Lade die Originaldatei herunter und prüfe ihren Inhalt.</p>
      </div>
    );
  return (
    <div className="shared-sheet-editor">
      <div className="document-toolbar" role="toolbar" aria-label="Tabelle bearbeiten">
        <button
          className="document-tool"
          aria-label="Rückgängig"
          title="Rückgängig"
          disabled={!editable || !undo.canUndo()}
          onClick={() => {
            commit();
            undo.undo();
          }}
        >
          <Undo2 size={18} />
        </button>
        <button
          className="document-tool"
          aria-label="Wiederholen"
          title="Wiederholen"
          disabled={!editable || !undo.canRedo()}
          onClick={() => {
            commit();
            undo.redo();
          }}
        >
          <Redo2 size={18} />
        </button>
        <button
          className="document-tool text-tool"
          disabled={!editable}
          onClick={() => grow("rows")}
        >
          <Plus size={16} /> Zeilen
        </button>
        <button
          className="document-tool text-tool"
          disabled={!editable}
          onClick={() => grow("columns")}
        >
          <Plus size={16} /> Spalten
        </button>
        <div className="sheet-page-controls">
          <button
            className="document-tool"
            aria-label="Vorherige Zeilen"
            disabled={page === 0}
            onClick={() => {
              selectCell((page - 1) * PAGE_ROWS + 1, selected.column);
            }}
          >
            <ArrowLeft size={17} />
          </button>
          <span>
            {first}–{last} / {rows}
          </span>
          <button
            className="document-tool"
            aria-label="Weitere Zeilen"
            disabled={last >= rows}
            onClick={() => {
              selectCell((page + 1) * PAGE_ROWS + 1, selected.column);
            }}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      <div className="sheet-formula-bar">
        <span className="sheet-coordinate">
          {columnName(selected.column)}
          {selected.row}
        </span>
        <input
          ref={input}
          aria-label={`Zelle ${columnName(selected.column)}${selected.row} bearbeiten`}
          value={draft}
          disabled={!editable}
          maxLength={4000}
          placeholder="Wert oder =Formel eingeben"
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onPaste={paste}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              navigate("down");
            } else if (event.key === "Escape") {
              event.preventDefault();
              dirty.current = false;
              setDraft(raw);
              input.current?.blur();
            }
          }}
        />
        <button
          className="document-tool"
          aria-label="Zellwert übernehmen"
          title="Zellwert übernehmen"
          disabled={!editable}
          onClick={commit}
        >
          <Check size={18} />
        </button>
      </div>
      <ErrorMessage message={error} />
      <SheetGrid
        sheet={sheet}
        columns={columns}
        first={first}
        last={last}
        layout={layout}
        selected={selected}
        grid={grid}
        display={(row, column) => displayCell(calculator(sheet.id, row, column))}
        onSelect={selectCell}
        onNavigate={navigate}
        onPaste={paste}
      />
      <footer className="sheet-tabs" aria-label="Tabellenblätter">
        {info.map((item) => (
          <button
            key={item.id}
            className={sheetId === item.id ? "active" : ""}
            aria-current={sheetId === item.id ? "page" : undefined}
            onClick={() => {
              commit();
              dirty.current = false;
              setSheetId(item.id);
              setSelected({ row: 1, column: 1 });
              setPage(0);
              setDraft(sheets.get(item.id)?.get("1:1") || "");
            }}
          >
            {item.name}
          </button>
        ))}
        <button
          className="sheet-edit-selected"
          disabled={!editable}
          onClick={() => input.current?.focus()}
        >
          <Pencil size={15} /> Zelle bearbeiten
        </button>
      </footer>
    </div>
  );
}
