/** Transform formula code without touching string literals, sheet names or structured references. */
export function mapFormulaCode(formula: string, transform: (code: string) => string): string {
  let output = "",
    start = 0,
    index = 0;
  while (index < formula.length) {
    const quote = formula[index];
    if (quote !== '"' && quote !== "'" && quote !== "[") {
      index++;
      continue;
    }
    output += transform(formula.slice(start, index));
    const protectedStart = index++;
    if (quote === "[") {
      let depth = 1;
      while (index < formula.length && depth) {
        if (formula[index] === "[") depth++;
        else if (formula[index] === "]") depth--;
        index++;
      }
    } else {
      while (index < formula.length) {
        if (formula[index++] !== quote) continue;
        if (formula[index] === quote) index++;
        else break;
      }
    }
    output += formula.slice(protectedStart, index);
    start = index;
  }
  return output + transform(formula.slice(start));
}

const lastColumn = 16384,
  lastRow = 1048576;
function columnNumber(name: string) {
  return [...name.toUpperCase()].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
}
function columnLabel(column: number) {
  let name = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function position(address: string) {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address);
  if (!match) throw new Error("Invalid shared formula address");
  return { row: Number(match[2]), column: columnNumber(match[1]) };
}

/** ExcelJS's shared-formula shifter also shifts A1-looking text inside quotes. */
export function translateSharedFormula(formula: string, from: string, to: string): string {
  const source = position(from),
    target = position(to),
    rowOffset = target.row - source.row,
    columnOffset = target.column - source.column;
  const shiftColumn = (reference: string) => {
    const current = columnNumber(reference.replace("$", ""));
    if (current > lastColumn) return reference;
    const next = current + (reference.startsWith("$") ? 0 : columnOffset);
    return next < 1 || next > lastColumn
      ? "#REF!"
      : `${reference.startsWith("$") ? "$" : ""}${columnLabel(next)}`;
  };
  const shiftRow = (reference: string) => {
    const current = Number(reference.replace("$", ""));
    const next = current + (reference.startsWith("$") ? 0 : rowOffset);
    return next < 1 || next > lastRow ? "#REF!" : `${reference.startsWith("$") ? "$" : ""}${next}`;
  };
  return mapFormulaCode(formula, (code) =>
    code
      .replace(
        /(?<![A-Z0-9_.])([$]?[A-Z]{1,3})([$]?\d+)(?![A-Z0-9_!]|\s*\()/gi,
        (reference, column: string, row: string) => {
          if (columnNumber(column.replace("$", "")) > lastColumn) return reference;
          const shiftedColumn = shiftColumn(column),
            shiftedRow = shiftRow(row);
          return shiftedColumn === "#REF!" || shiftedRow === "#REF!"
            ? "#REF!"
            : `${shiftedColumn}${shiftedRow}`;
        },
      )
      .replace(
        /(?<![A-Z0-9_.])([$]?[A-Z]{1,3}):([$]?[A-Z]{1,3})(?![A-Z0-9_!])/gi,
        (_reference, first: string, last: string) => `${shiftColumn(first)}:${shiftColumn(last)}`,
      )
      .replace(
        /(?<![A-Z0-9_.])([$]?\d+):([$]?\d+)(?![A-Z0-9_!])/gi,
        (_reference, first: string, last: string) => `${shiftRow(first)}:${shiftRow(last)}`,
      ),
  );
}
