import React from "react";
import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { prepareFonts } from "@/modules/exports/pdf";
import { addPageNumbers } from "@/modules/exports/page-numbers";
import { SHEETS_MAP, type DocumentMetadata } from "./contracts";
import { createSheetCalculator, displayCell, columnName } from "./sheet-values";
import { documentNotes, plainText, sheetDimensions } from "./presentation";
import { textRunStyle } from "./word-formatting";
import { cellFormatting } from "./sheet-formatting";
import { sheetPrintPages } from "./sheet-print-layout";
import { safeSheetMetadata } from "./format-upgrade";

const style = StyleSheet.create({
  page: {
    fontFamily: "Noto",
    fontSize: 10,
    color: "#233932",
    lineHeight: 1.45,
    paddingHorizontal: 34,
    paddingTop: 68,
    paddingBottom: 45,
  },
  header: {
    position: "absolute",
    top: 24,
    left: 34,
    right: 34,
    borderBottomWidth: 0.6,
    borderBottomColor: "#cbd6cf",
    paddingBottom: 10,
    fontSize: 9,
    color: "#53645e",
  },
  paragraph: { marginBottom: 10 },
  heading: { fontWeight: 700, color: "#1e5f50", marginBottom: 9, marginTop: 12 },
  image: { maxWidth: 470, height: 250, objectFit: "contain", marginVertical: 10 },
  quote: { borderLeftWidth: 2, borderLeftColor: "#cbd6cf", paddingLeft: 12, marginVertical: 8 },
  table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: "#cbd6cf", marginVertical: 8 },
  row: { flexDirection: "row" },
  cell: {
    flexBasis: 0,
    flexGrow: 1,
    padding: 6,
    borderRightWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: "#cbd6cf",
    fontSize: 8,
  },
  rowNumber: {
    width: 30,
    flexShrink: 0,
    padding: 5,
    fontSize: 7,
    color: "#53645e",
    backgroundColor: "#edf3ef",
    borderBottomWidth: 0.5,
    borderColor: "#cbd6cf",
  },
  sheetCell: {
    flexBasis: 0,
    flexGrow: 1,
    padding: 5,
    borderBottomWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "#cbd6cf",
    fontSize: 8,
  },
  note: { marginBottom: 20 },
  label: { fontWeight: 700, fontSize: 9, color: "#1e5f50", marginBottom: 5 },
});
function PrintPage({
  name,
  children,
  landscape = false,
}: {
  name: string;
  children: React.ReactNode;
  landscape?: boolean;
}) {
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={style.page}>
      <View fixed style={style.header}>
        <Text>DigitalMask · {name}</Text>
      </View>
      {children}
    </Page>
  );
}
function Inline({ nodes }: { nodes: JSONContent[] }) {
  return (
    <>
      {nodes.map((node, index) =>
        node.type === "hardBreak" ? (
          "\n"
        ) : (
          <Text
            key={index}
            style={{
              fontWeight: node.marks?.some((mark) => mark.type === "bold") ? 700 : 400,
              color: textRunStyle(node).color,
              backgroundColor: textRunStyle(node).backgroundColor,
              fontSize: textRunStyle(node).fontSize,
              textDecoration: node.marks?.some((mark) => mark.type === "underline")
                ? "underline"
                : node.marks?.some((mark) => mark.type === "strike")
                  ? "line-through"
                  : undefined,
            }}
          >
            {node.text || (node.content ? plainText(node) : "")}
          </Text>
        ),
      )}
    </>
  );
}
function ParagraphContent({ node, prefix = "" }: { node: JSONContent; prefix?: string }) {
  const groups: JSONContent[][] = [[]];
  const nodes = node.content || [];
  for (const item of nodes) {
    if (item.type === "image") groups.push([item], []);
    else groups.at(-1)!.push(item);
  }
  return (
    <>
      {groups.map((group, i) => {
        if (group[0]?.type === "image") {
          const src = String(group[0].attrs?.src || "");
          return /^data:image\/(?:png|jpeg);base64,/.test(src) && src.length < 2_000_000 ? (
            <PdfImage key={i} src={src} style={style.image} />
          ) : null;
        }
        if (!group.length && groups.length > 1) return null;
        return (
          <Text
            key={i}
            style={
              node.type === "heading"
                ? {
                    ...style.heading,
                    fontSize: 20 - Math.min(3, Number(node.attrs?.level) || 1) * 2,
                  }
                : style.paragraph
            }
          >
            {i === 0 ? prefix : ""}
            <Inline nodes={group} />
          </Text>
        );
      })}
    </>
  );
}
function TextBlocks({ nodes, depth = 0 }: { nodes: JSONContent[]; depth?: number }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === "table")
          return (
            <View key={index} style={style.table}>
              {(node.content || []).map((row, r) => (
                <View key={r} style={style.row}>
                  {(row.content || []).map((cell, c) => (
                    <View
                      key={c}
                      style={{
                        ...style.cell,
                        flexGrow: Number(cell.attrs?.colspan) || 1,
                        backgroundColor: cell.type === "tableHeader" ? "#edf3ef" : undefined,
                      }}
                    >
                      <TextBlocks nodes={cell.content || []} depth={depth + 1} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        if (node.type === "bulletList" || node.type === "orderedList")
          return (
            <View key={index} style={{ paddingLeft: 10 + depth * 5 }}>
              {(node.content || []).map((item, i) => (
                <View key={i}>
                  {(item.content || []).map((child, j) =>
                    child.type === "paragraph" ? (
                      <ParagraphContent
                        key={j}
                        node={child}
                        prefix={
                          j === 0
                            ? node.type === "orderedList"
                              ? `${(Number(node.attrs?.start) || 1) + i}. `
                              : "• "
                            : ""
                        }
                      />
                    ) : (
                      <TextBlocks key={j} nodes={[child]} depth={depth + 1} />
                    ),
                  )}
                </View>
              ))}
            </View>
          );
        if (node.type === "blockquote")
          return (
            <View key={index} style={style.quote}>
              <TextBlocks nodes={node.content || []} depth={depth + 1} />
            </View>
          );
        if (node.type === "horizontalRule")
          return (
            <View
              key={index}
              style={{ borderBottomWidth: 0.6, borderColor: "#cbd6cf", marginVertical: 12 }}
            />
          );
        return <ParagraphContent key={index} node={node} />;
      })}
    </>
  );
}
export async function exportTextPdf(json: JSONContent, name: string) {
  await prepareFonts();
  return Buffer.from(
    await addPageNumbers(
      await renderToBuffer(
        <Document title={name} author="DigitalMask">
          <PrintPage name={name}>
            <TextBlocks nodes={json.content || []} />
          </PrintPage>
        </Document>,
      ),
    ),
  );
}
export async function exportSpreadsheetPdf(
  document: Y.Doc,
  metadata: DocumentMetadata,
  name: string,
) {
  metadata = safeSheetMetadata(document, metadata);
  await prepareFonts();
  const info = metadata.sheets || [];
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const evaluate = createSheetCalculator(sheets, info);
  const pages: React.ReactNode[] = [];
  for (const sheet of info) {
    const dimension = sheetDimensions(document, sheet);
    const values = sheets.get(sheet.id);
    let lastColumn = 1,
      lastRow = 1;
    values?.forEach((raw, key) => {
      const [row, col] = key.split(":").map(Number);
      if (raw && row >= 1 && col >= 1 && row <= dimension.rows && col <= dimension.columns) {
        lastColumn = Math.max(lastColumn, col);
        lastRow = Math.max(lastRow, row);
      }
    });
    for (const key of Object.keys(sheet.cellStyles || {})) {
      const [row, column] = key.split(":").map(Number);
      if (row >= 1 && column >= 1 && row <= dimension.rows && column <= dimension.columns) {
        lastColumn = Math.max(lastColumn, column);
        lastRow = Math.max(lastRow, row);
      }
    }
    const bands = Math.ceil(lastColumn / 7);
    for (let band = 0; band < bands; band++) {
      const columns = Array.from(
        { length: Math.min(7, lastColumn - band * 7) },
        (_, i) => band * 7 + i + 1,
      );
      const label = `${name} · ${sheet.name}${bands > 1 ? ` · Spalten ${columnName(columns[0])}–${columnName(columns.at(-1)!)}` : ""}`;
      const printed = sheetPrintPages(sheet, columns, lastRow, (row, column) =>
        displayCell(evaluate(sheet.id, row, column)),
      );
      for (const [index, page] of printed.entries())
        pages.push(
          <PrintPage key={`${sheet.id}:${band}:${index}`} name={label} landscape>
            <View style={{ ...style.row, backgroundColor: "#edf3ef" }}>
              <Text style={style.rowNumber}>#</Text>
              {columns.map((column, c) => (
                <Text
                  key={column}
                  style={{
                    ...style.sheetCell,
                    flexGrow: 0,
                    flexBasis: undefined,
                    width: page.widths[c],
                    fontWeight: 700,
                  }}
                >
                  {columnName(column)}
                </Text>
              ))}
            </View>
            <View wrap={false} style={{ height: page.height, position: "relative" }}>
              {page.segments.map((segment, s) => (
                <Text
                  key={s}
                  style={{
                    ...style.rowNumber,
                    position: "absolute",
                    left: 0,
                    top: page.tops[s],
                    height: segment.height,
                  }}
                >
                  {segment.row}
                  {segment.chunk ? " ↳" : ""}
                </Text>
              ))}
              {page.cells.map((cell, c) => {
                const formatting = cellFormatting(sheet, cell.row, cell.column);
                const borders = Object.fromEntries(
                  (["top", "right", "bottom", "left"] as const).flatMap((side) => {
                    const edge = formatting.borders?.[side],
                      name = side[0].toUpperCase() + side.slice(1);
                    return edge
                      ? [
                          [`border${name}Color`, edge.color],
                          [`border${name}Width`, edge.width * 0.75],
                          [`border${name}Style`, edge.style === "double" ? "solid" : edge.style],
                        ]
                      : [];
                  }),
                );
                return (
                  <View
                    key={c}
                    style={{
                      position: "absolute",
                      left: 30 + cell.left,
                      top: cell.top,
                      width: cell.width,
                      height: cell.height,
                      backgroundColor: formatting.background || "#FFFFFF",
                      borderBottomWidth: 0.5,
                      borderRightWidth: 0.5,
                      borderColor: "#cbd6cf",
                      paddingHorizontal: 4,
                      paddingVertical: 1.5,
                      justifyContent:
                        formatting.vertical === "middle"
                          ? "center"
                          : formatting.vertical === "bottom"
                            ? "flex-end"
                            : "flex-start",
                      ...borders,
                    }}
                  >
                    <Text
                      style={{
                        color: formatting.color || "#000000",
                        fontSize: Math.max(4.5, Math.min(72, (formatting.fontSize || 11) * 0.75)),
                        fontWeight: formatting.bold ? 700 : 400,
                        textAlign: formatting.horizontal || "left",
                        textDecoration: formatting.underline
                          ? "underline"
                          : formatting.strike
                            ? "line-through"
                            : undefined,
                        lineHeight: 1.15,
                      }}
                    >
                      {cell.value}
                    </Text>
                  </View>
                );
              })}
            </View>
          </PrintPage>,
        );
    }
  }
  return Buffer.from(
    await addPageNumbers(
      await renderToBuffer(
        <Document title={name} author="DigitalMask">
          {pages.length ? (
            pages
          ) : (
            <PrintPage name={name}>
              <Text>Leere Tabelle</Text>
            </PrintPage>
          )}
        </Document>,
      ),
    ),
  );
}
export async function exportAnnotatedPdf(
  document: Y.Doc,
  metadata: DocumentMetadata,
  original: Buffer,
  name: string,
) {
  const notes = documentNotes(document, metadata.pdfPages || 1).filter((note) => note.text.trim());
  if (!notes.length) return original;
  await prepareFonts();
  const appendix = await renderToBuffer(
    <Document title={`${name} · Gemeinsame Notizen`}>
      <PrintPage name={`${name} · Gemeinsame Notizen`}>
        <Text style={{ ...style.heading, fontSize: 18 }}>Gemeinsame Notizen</Text>
        {notes.map((note, i) => (
          <View key={i} style={style.note}>
            <Text style={style.label}>
              Seite {note.page} · {note.author}
            </Text>
            <Text>{note.text}</Text>
          </View>
        ))}
      </PrintPage>
    </Document>,
  );
  const pdf = await PDFDocument.load(original),
    extra = await PDFDocument.load(appendix);
  const copied = await pdf.copyPages(extra, extra.getPageIndices());
  for (const page of copied) pdf.addPage(page);
  return Buffer.from(await pdf.save());
}
