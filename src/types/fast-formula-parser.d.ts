declare module "fast-formula-parser" {
  interface CellReference {
    sheet: string;
    row: number;
    col: number;
  }
  interface RangeReference {
    sheet: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }
  export default class FormulaParser {
    constructor(options: {
      onCell: (ref: CellReference) => unknown;
      onRange: (ref: RangeReference) => unknown[][];
      onVariable?: (name: string, sheet: string) => unknown;
      functions?: Record<string, (...args: unknown[]) => unknown>;
    });
    parse(formula: string, position: CellReference): unknown;
    static FormulaError: { REF: Error; NAME: Error; VALUE: Error; ERROR: Error };
  }
}
