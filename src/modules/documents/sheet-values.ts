import FormulaParser from "fast-formula-parser";
import type * as Y from "yjs";
import { mapFormulaCode } from "./formula-tokens";
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
  WENNFEHLER: "IFERROR",
  ZÄHLENWENN: "COUNTIF",
  ZÄHLENWENNS: "COUNTIFS",
  SUMMEWENN: "SUMIF",
  SUMMEWENNS: "SUMIFS",
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
  return mapFormulaCode(raw.replace(/^=/, ""), (code) =>
    code
      .replaceAll(";", ",")
      .replace(
        /\b([A-ZÄÖÜ][A-ZÄÖÜ0-9]*)(?=\s*\()/gi,
        (name) => aliases[name.toUpperCase()] || name,
      ),
  );
}
const formulaArrayIndexes = new WeakMap<
  SheetInfo[],
  Map<string, NonNullable<SheetInfo["formulaArrays"]>[number]>
>();
/** One calculator per render/export, with bounded ranges and circular-reference detection. */
export function createSheetCalculator(sheets: Y.Map<Y.Map<string>>, info: SheetInfo[]) {
  const cache = new Map<string, unknown>();
  const errors = new Set<string>();
  const excelPending = new Set<string>();
  const visiting = new Set<string>();
  let arrays = formulaArrayIndexes.get(info);
  if (!arrays) {
    arrays = new Map<string, NonNullable<SheetInfo["formulaArrays"]>[number]>();
    for (const sheet of info)
      for (const range of sheet.formulaArrays || []) {
        const address = range.ref.replaceAll("$", "").split(":"),
          first = /^([A-Z]+)([1-9]\d*)$/i.exec(address[0]),
          last = /^([A-Z]+)([1-9]\d*)$/i.exec(address[1] || address[0]);
        if (!first || !last) continue;
        const number = (label: string) =>
          [...label.toUpperCase()].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
        for (let row = Number(first[2]); row <= Math.min(MAX_SHEET_ROWS, Number(last[2])); row++)
          for (
            let column = number(first[1]);
            column <= Math.min(MAX_SHEET_COLUMNS, number(last[1]));
            column++
          )
            arrays.set(`${sheet.id}:${cellKey(row, column)}`, range);
      }
    formulaArrayIndexes.set(info, arrays);
  }
  const arrayAnchor = (id: string, row: number, column: number) => {
    const array = arrays!.get(`${id}:${cellKey(row, column)}`);
    return array && sheets.get(id)?.get(array.anchor) === array.formula ? array.anchor : undefined;
  };
  let evaluations = 0;
  const sheetId = (name: string) =>
    info.find((sheet) => sheet.name === name || sheet.id === name)?.id;
  const parsers: FormulaParser[] = [];
  function propagateExcelCalculation(key: string) {
    if (excelPending.has(key)) for (const current of visiting) excelPending.add(current);
  }
  const parserOptions: ConstructorParameters<typeof FormulaParser>[0] = {
    onCell: ({ sheet, row, col }) => {
      const id = sheetId(sheet);
      if (!id || row < 1 || col < 1 || row > MAX_SHEET_ROWS || col > MAX_SHEET_COLUMNS)
        throw FormulaParser.FormulaError.REF;
      const result = evaluate(id, row, col);
      const key = `${id}:${cellKey(row, col)}`;
      if (errors.has(key)) {
        propagateExcelCalculation(key);
        throw FormulaParser.FormulaError.VALUE;
      }
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
          const key = `${id}:${cellKey(r + from.row, c + from.col)}`;
          if (errors.has(key)) {
            propagateExcelCalculation(key);
            throw FormulaParser.FormulaError.VALUE;
          }
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
    if (visiting.has(key)) {
      errors.add(key);
      return "#ZIRKEL!";
    }
    const raw = sheets.get(id)?.get(cellKey(row, column)) || "";
    if (arrayAnchor(id, row, column)) {
      errors.add(key);
      excelPending.add(key);
      cache.set(key, "#EXCEL!");
      return "#EXCEL!";
    }
    if (!raw.startsWith("=")) return inputValue(raw);
    if (++evaluations > MAX_SHEET_CELLS || visiting.size > 100 || raw.length > 4000) {
      errors.add(key);
      excelPending.add(key);
      return "#LIMIT!";
    }
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
      if (result instanceof Error) {
        errors.add(key);
        result = result.name.startsWith("#") ? result.name : "#FORMEL!";
      }
      if (typeof result === "number" && !Number.isFinite(result)) {
        errors.add(key);
        result = "#ZAHL!";
      }
      if (Array.isArray(result)) {
        errors.add(key);
        result = "#FORMEL!";
      }
    } catch (error) {
      errors.add(key);
      result = error instanceof Error && error.name.startsWith("#") ? error.name : "#FORMEL!";
    }
    if (
      errors.has(key) &&
      ["#NAME?", "#ERROR!", "#FORMEL!", "#EXCEL!", "#LIMIT!"].includes(String(result))
    )
      excelPending.add(key);
    // IFERROR may hide a browser limitation, but its fallback is not Excel's actual result.
    if (excelPending.has(key)) {
      errors.add(key);
      result = "#EXCEL!";
    }
    visiting.delete(key);
    cache.set(key, result);
    return result;
  }
  return Object.assign(evaluate, {
    arrayAnchor,
    needsExcel(id: string, row: number, column: number) {
      evaluate(id, row, column);
      return excelPending.has(`${id}:${cellKey(row, column)}`);
    },
    hasError(id: string, row: number, column: number) {
      evaluate(id, row, column);
      return errors.has(`${id}:${cellKey(row, column)}`);
    },
  });
}
export function displayCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number")
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 8 }).format(value);
  if (typeof value === "boolean") return value ? "WAHR" : "FALSCH";
  return String(value);
}
