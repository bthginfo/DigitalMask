import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import { yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import { textSchema } from "./text-schema";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  PDF_NOTES,
  TEXT_FRAGMENT,
  type SheetInfo,
} from "./contracts";

export function documentJson(document: Y.Doc): JSONContent {
  return yXmlFragmentToProseMirrorRootNode(
    document.getXmlFragment(TEXT_FRAGMENT),
    textSchema(),
  ).toJSON();
}
export function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") return node.attrs?.alt ? `[Bild: ${node.attrs.alt}]` : "[Bild]";
  const separator = [
    "doc",
    "table",
    "tableRow",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
  ].includes(node.type || "")
    ? "\n"
    : "";
  return (node.content || []).map(plainText).join(separator);
}
export function sheetDimensions(document: Y.Doc, sheet: SheetInfo) {
  const dimension = document.getMap<{ rows: number; columns: number }>("dimensions").get(sheet.id);
  return {
    rows: Math.min(MAX_SHEET_ROWS, Math.max(sheet.rows, Number(dimension?.rows) || 0)),
    columns: Math.min(MAX_SHEET_COLUMNS, Math.max(sheet.columns, Number(dimension?.columns) || 0)),
  };
}
export function documentNotes(document: Y.Doc, pages: number) {
  const notes = document.getArray<Y.Map<unknown>>(PDF_NOTES).toArray();
  return notes
    .filter((note) => note instanceof Y.Map)
    .slice(0, 200)
    .map((note) => {
      const text = note.get("text");
      return {
        id: String(note.get("id") || ""),
        page: Math.max(1, Math.min(pages, Number(note.get("page")) || 1)),
        text: (text instanceof Y.Text ? text.toString() : String(text || "")).slice(0, 50_000),
        author: String(note.get("authorName") || "Team").slice(0, 200),
      };
    });
}
