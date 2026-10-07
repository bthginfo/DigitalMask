import type { LiveAccess } from "@/shared/live-sync";

export type DocumentFormat = "text" | "sheet" | "pdf";
export interface SheetCellStyle {
  background?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  horizontal?: "left" | "center" | "right" | "justify";
  vertical?: "top" | "middle" | "bottom";
  wrap?: boolean;
  borders?: Partial<
    Record<
      "top" | "right" | "bottom" | "left",
      {
        color: string;
        width: number;
        style: "solid" | "dashed" | "dotted" | "double";
      }
    >
  >;
}
export interface SheetInfo {
  id: string;
  name: string;
  rows: number;
  columns: number;
  widths?: number[];
  merges?: string[];
  /** All layout dimensions use CSS pixels, including legacy widths. */
  heights?: number[];
  styles?: SheetCellStyle[];
  cellStyles?: Record<string, number>;
  /** Array/spill outputs are Excel-calculated, not independent editable input values. */
  formulaArrays?: { anchor: string; ref: string; formula: string }[];
}
export interface DocumentMetadata {
  sourceName: string;
  warnings: string[];
  sheets?: SheetInfo[];
  pdfPages?: number;
  formattingVersion?: 1;
}
export interface DocumentState {
  state: string;
  revision: number;
}
export interface DocumentSession extends DocumentState {
  fileId: string;
  name: string;
  format: DocumentFormat;
  metadata: DocumentMetadata;
  canEdit: boolean;
  access: LiveAccess;
}
export const documentMime = {
  text: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  sheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;
/** Shared Yjs names form the durable document format; changing them requires a migration. */
export const TEXT_FRAGMENT = "body";
export const SHEETS_MAP = "sheets";
export const PDF_NOTES = "notes";
export const MAX_DOCUMENT_BYTES = 3_000_000;
export const MAX_SHEET_ROWS = 1000;
export const MAX_SHEET_COLUMNS = 100;
export const MAX_SHEET_CELLS = 50_000;
export const cellKey = (row: number, column: number) => `${row}:${column}`;
export function documentFormat(mime: unknown): DocumentFormat | null {
  if (mime === documentMime.text) return "text";
  if (mime === documentMime.sheet || mime === "text/csv") return "sheet";
  if (mime === documentMime.pdf) return "pdf";
  return null;
}
