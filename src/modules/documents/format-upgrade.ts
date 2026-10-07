import type { DocumentMetadata } from "./contracts";
import { cellKey, SHEETS_MAP } from "./contracts";
import type * as Y from "yjs";
import { createSheetLayout } from "./sheet-layout";
import { columnName } from "./sheet-values";

/** Imported presentation metadata is independent of the collaborative cell values and dimensions. */
export function upgradeSheetMetadata(
  current: DocumentMetadata,
  source: DocumentMetadata,
): DocumentMetadata {
  return {
    ...current,
    formattingVersion: 1,
    warnings: source.warnings,
    sheets: (current.sheets || []).map((sheet) => {
      const original = source.sheets?.find((entry) => entry.id === sheet.id);
      if (!original) return sheet;
      return {
        ...sheet,
        widths: original.widths || sheet.widths,
        heights: sheet.heights || original.heights,
        merges: sheet.merges || original.merges,
        styles: sheet.styles || original.styles,
        cellStyles: sheet.cellStyles || original.cellStyles,
        formulaArrays: sheet.formulaArrays || original.formulaArrays,
      };
    }),
  };
}

/** Old flat editors could write into merged slave cells; expose every such edit instead of hiding it. */
export function safeSheetMetadata(document: Y.Doc, metadata: DocumentMetadata): DocumentMetadata {
  let changed = false;
  const sheets = (metadata.sheets || []).map((sheet) => {
    const values = document.getMap<Y.Map<string>>(SHEETS_MAP).get(sheet.id);
    if (!values || !sheet.merges?.length) return sheet;
    const layout = createSheetLayout(sheet, 1000, 100),
      conflicts = new Set<string>();
    values.forEach((raw, key) => {
      if (!raw) return;
      const range = layout.covered.get(key);
      if (range && key !== cellKey(range.first.row, range.first.column)) {
        conflicts.add(
          `${columnName(range.first.column)}${range.first.row}:${columnName(range.last.column)}${range.last.row}`,
        );
      }
    });
    if (!conflicts.size) return sheet;
    changed = true;
    return {
      ...sheet,
      merges: sheet.merges.filter(
        (merge) => !conflicts.has(merge.replaceAll("$", "").toUpperCase()),
      ),
    };
  });
  const warning =
    "Einige frühere Änderungen lagen in verbundenen Zellen. Diese Verbindungen wurden gelöst, damit alle eingetragenen Werte sichtbar bleiben.";
  return changed
    ? { ...metadata, sheets, warnings: [...new Set([...metadata.warnings, warning])] }
    : metadata;
}
