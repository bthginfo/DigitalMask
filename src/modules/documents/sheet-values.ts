import FormulaParser from "fast-formula-parser";
import type * as Y from "yjs";
import {
  cellKey,
  MAX_SHEET_CELLS,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type SheetInfo,
} from "./contracts";

export function columnName(column: number): string {
  let label = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
export function inputValue(raw: string): string | number | boolean | null {
  if (!raw) return null;
  if (raw.startsWith("'")) return raw.slice(1);
  if (/^(?:true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  // Leading zeros are identifiers, e.g. telephone numbers, rather than numbers.
  if (/^[+-]?(?:0|[1-9]\d*)(?:[.,]\d+)?$/.test(raw.trim())) {
    const number = Number(raw.trim().replace(",", "."));
    if (Number.isFinite(number)) return number;
  }
  return raw;
}
const aliases: Record<string, string> = {
  SUMME: "SUM",
  MITTELWERT: "AVERAGE",
  WENN: "IF",
  ZÄHLENWENN: "COUNTIF",
  ANZAHL: "COUNT",
  ANZAHL2: "COUNTA",
  MINIMUM: "MIN",
  MAXIMUM: "MAX",
  RUNDEN: "ROUND",
  UND: "AND",
  ODER: "OR",
  NICHT: "NOT",
  HEUTE: "TODAY",
  JETZT: "NOW",
};
export function excelFormula(raw: string) {
  let quoted = false;
  const translated = raw.replace(/^=/, "").replace(/"|;/g, (part) => {
    if (part === '"') quoted = !quoted;
    return part === ";" && !quoted ? "," : part;
  });
  return translated.replace(
    /\b([A-ZÄÖÜ]+)(?=\s*\()/gi,
    (name) => aliases[name.toUpperCase()] || name,
  );
}
/** One calculator per render/export, with bounded ranges and circular-reference detection. */
export function createSheetCalculator(sheets: Y.Map<Y.Map<string>>, info: SheetInfo[]) {
  const cache = new Map<string, unknown>();
  const visiting = new Set<string>();
  let evaluations = 0;
  const sheetId = (name: string) =>
    info.find((sheet) => sheet.name === name || sheet.id === name)?.id;
  const parsers: FormulaParser[] = [];
  const parserOptions: ConstructorParameters<typeof FormulaParser>[0] = {
    onCell: ({ sheet, row, col }) => {
      const id = sheetId(sheet);
      if (!id || row < 1 || col < 1 || row > MAX_SHEET_ROWS || col > MAX_SHEET_COLUMNS)
        throw FormulaParser.FormulaError.REF;
      const result = evaluate(id, row, col);
      if (typeof result === "string" && /^#/.test(result)) throw FormulaParser.FormulaError.VALUE;
      return result === null ? 0 : result;
    },
    onRange: ({ sheet, from, to }) => {
      const id = sheetId(sheet);
      if (!id) throw FormulaParser.FormulaError.REF;
      const lastRow = Math.min(to.row, MAX_SHEET_ROWS);
      const lastColumn = Math.min(to.col, MAX_SHEET_COLUMNS);
      if (
        from.row < 1 ||
        from.col < 1 ||
        (lastRow - from.row + 1) * (lastColumn - from.col + 1) > MAX_SHEET_CELLS
      )
        throw FormulaParser.FormulaError.REF;
      return Array.from({ length: Math.max(0, lastRow - from.row + 1) }, (_, r) =>
        Array.from({ length: Math.max(0, lastColumn - from.col + 1) }, (_, c) => {
          const result = evaluate(id, r + from.row, c + from.col);
          if (typeof result === "string" && /^#/.test(result))
            throw FormulaParser.FormulaError.VALUE;
          return result;
        }),
      );
    },
    functions: {
      WEBSERVICE: () => {
        throw FormulaParser.FormulaError.NAME;
      },
    },
  };
  function evaluate(id: string, row: number, column: number): unknown {
    const key = `${id}:${cellKey(row, column)}`;
    if (cache.has(key)) return cache.get(key);
    if (visiting.has(key)) return "#ZIRKEL!";
    const raw = sheets.get(id)?.get(cellKey(row, column)) || "";
    if (!raw.startsWith("=")) return inputValue(raw);
    if (++evaluations > MAX_SHEET_CELLS || visiting.size > 100 || raw.length > 4000)
      return "#LIMIT!";
    visiting.add(key);
    let result: unknown;
    try {
      // Parser instances hold evaluation context. Nested formulas need their own depth's parser.
      const parser = (parsers[visiting.size - 1] ??= new FormulaParser(parserOptions));
      result = parser.parse(excelFormula(raw), {
        row,
        col: column,
        sheet: info.find((sheet) => sheet.id === id)?.name || id,
      });
      if (result instanceof Error) result = result.message || "#FORMEL!";
      if (typeof result === "number" && !Number.isFinite(result)) result = "#ZAHL!";
    } catch (error) {
      result = error instanceof Error && error.name.startsWith("#") ? error.name : "#FORMEL!";
    }
    visiting.delete(key);
    cache.set(key, result);
    return result;
  }
  return evaluate;
}
export function displayCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number")
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 8 }).format(value);
  if (typeof value === "boolean") return value ? "WAHR" : "FALSCH";
  return String(value);
}
