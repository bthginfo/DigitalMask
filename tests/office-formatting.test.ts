import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as Y from "yjs";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { importDocument } from "@/modules/documents/import";
import { encodeDocument, mergedDocument } from "@/modules/documents/state";
import { documentJson, plainText } from "@/modules/documents/presentation";
import { exportWord } from "@/modules/documents/word-export";
import { exportSpreadsheet } from "@/modules/documents/sheet-export";
import { patchOriginalSpreadsheet, patchOriginalWord } from "@/modules/documents/office-package";
import { wordStyleParagraphs, restoreWordFormatting } from "@/modules/documents/word-formatting";
import { inspectOfficeArchive } from "@/modules/documents/file-policy";
import { textSchema } from "@/modules/documents/text-schema";
import { safeSheetMetadata, upgradeSheetMetadata } from "@/modules/documents/format-upgrade";
import { cellFormatting } from "@/modules/documents/sheet-formatting";
import { SHEETS_MAP, TEXT_FRAGMENT } from "@/modules/documents/contracts";
import { themeColors, excelColor } from "@/modules/documents/office-colors";
import { strToU8 } from "fflate";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { exportTextPdf, exportSpreadsheetPdf } from "@/modules/documents/pdf-export";
import { resolve } from "node:path";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

async function coloredWord() {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun("Normal "),
                new TextRun({ text: "Rote Schrift", color: "FF0000", bold: true, size: 28 }),
                new TextRun(" danach."),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Blauer Hinweis",
                  color: "17627F",
                  shading: { fill: "FFFF00" },
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
}
async function coloredSheet() {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Tabelle1");
  for (let col = 1; col <= 12; col++) sheet.getColumn(col).width = 10.71;
  sheet.getRow(2).height = 15;
  sheet.getRow(4).height = 24;
  for (let col = 3; col <= 7; col++) {
    sheet.getCell(2, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    };
    sheet.getCell(4, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17627F" },
    };
    sheet.getCell(7, col).value = ["DAS", "IST", "EINE", "TEST", "FILE"][col - 3];
  }
  sheet.getCell("C7").font = { color: { argb: "FFFF0000" }, bold: true, size: 11 };
  sheet.mergeCells("C9:G10");
  sheet.getCell("C9").value = "Gemeinsam verbunden";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("Office formatting preservation", () => {
  it("retains Word run colors and sizes through CRDT and an edited DOCX download", async () => {
    const original = await coloredWord(),
      imported = await importDocument(original, "Farben.docx", "text");
    const document = mergedDocument([imported.state]),
      json = documentJson(document);
    const red = json.content![0].content!.find((node) => node.text === "Rote Schrift")!;
    expect(red.marks).toContainEqual(
      expect.objectContaining({
        type: "textStyle",
        attrs: expect.objectContaining({ color: "#FF0000", fontSize: "14pt" }),
      }),
    );
    expect(red.marks).toContainEqual({ type: "bold" });
    expect(json.content![1].content![0].marks).toContainEqual(
      expect.objectContaining({
        type: "textStyle",
        attrs: expect.objectContaining({ color: "#17627F", backgroundColor: "#FFFF00" }),
      }),
    );
    json.content!.push({ type: "paragraph", content: [{ type: "text", text: "Ergänzt" }] });
    const result = await importDocument(
      patchOriginalWord(original, await exportWord(json, "Farben")),
      "Farben.docx",
      "text",
    );
    const current = mergedDocument([result.state]);
    expect(plainText(documentJson(current))).toContain("Ergänzt");
    expect(JSON.stringify(documentJson(current))).toContain("#FF0000");
    expect(JSON.stringify(documentJson(current))).toContain("#FFFF00");
    document.destroy();
    current.destroy();
  });
  it("recovers absent legacy Word colors without replacing edits, custom colors or concurrent text", async () => {
    const original = await coloredWord(),
      ranges = wordStyleParagraphs(inspectOfficeArchive(original, "text"));
    const document = prosemirrorJSONToYDoc(
      textSchema(),
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Normal Rote Schrift danach.", marks: [{ type: "bold" }] },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Blauer Hinweis",
                marks: [{ type: "textStyle", attrs: { color: "#00AA00" } }],
              },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Lenas Änderung" }] },
        ],
      },
      TEXT_FRAGMENT,
    );
    const other = mergedDocument([encodeDocument(document)]),
      vector = Y.encodeStateVector(document);
    const inserted = new Y.XmlElement("paragraph"),
      text = new Y.XmlText();
    other.getXmlFragment(TEXT_FRAGMENT).push([inserted]);
    inserted.push([text]);
    text.insert(0, "Parallel ergänzt");
    expect(restoreWordFormatting(document, ranges)).toBeGreaterThan(0);
    Y.applyUpdate(other, Y.encodeStateAsUpdate(document, vector));
    Y.applyUpdate(document, Y.encodeStateAsUpdate(other));
    const json = documentJson(document);
    expect(JSON.stringify(json)).toContain("#FF0000");
    expect(JSON.stringify(json)).toContain("#00AA00");
    expect(plainText(json)).toContain("Lenas Änderung");
    expect(plainText(json)).toContain("Parallel ergänzt");
    expect(restoreWordFormatting(document, ranges)).toBe(0); // Idempotent once restored.
    document.destroy();
    other.destroy();
  });
  it("does not guess source formatting for duplicate or changed paragraphs", () => {
    const document = prosemirrorJSONToYDoc(
      textSchema(),
      {
        type: "doc",
        content: ["Hinweis", "Hinweis", "Bearbeitet"].map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      },
      TEXT_FRAGMENT,
    );
    expect(
      restoreWordFormatting(document, [
        { text: "Hinweis", ranges: [{ from: 0, to: 7, style: { color: "#FF0000" } }] },
        { text: "Original", ranges: [{ from: 0, to: 8, style: { color: "#FF0000" } }] },
      ]),
    ).toBe(0);
    expect(JSON.stringify(documentJson(document))).not.toContain("#FF0000");
    document.destroy();
  });
  it("shows empty colored Excel cells, source dimensions and merges, while preserving edited values", async () => {
    const original = await coloredSheet(),
      imported = await importDocument(original, "Farben.xlsx", "sheet");
    const sheet = imported.metadata.sheets![0],
      document = mergedDocument([imported.state]);
    expect(cellFormatting(sheet, 2, 3).background).toBe("#FFFF00");
    expect(cellFormatting(sheet, 4, 7).background).toBe("#17627F");
    expect(cellFormatting(sheet, 7, 3).color).toBe("#FF0000");
    expect(sheet.widths![0]).toBe(80);
    expect(sheet.heights![3]).toBe(32);
    expect(sheet.merges).toContain("C9:G10");
    const legacy = {
      sourceName: "Farben.xlsx",
      warnings: [],
      sheets: [
        {
          id: sheet.id,
          name: sheet.name,
          rows: 60,
          columns: 12,
          widths: sheet.widths,
          merges: sheet.merges,
        },
      ],
    };
    const values = document.getMap<Y.Map<string>>(SHEETS_MAP).get(sheet.id)!;
    values.set("7:3", "Lenas Änderung");
    const before = encodeDocument(document),
      metadata = upgradeSheetMetadata(legacy, imported.metadata);
    expect(encodeDocument(document)).toBe(before);
    expect(metadata.sheets![0].rows).toBe(60);
    expect(cellFormatting(metadata.sheets![0], 2, 3).background).toBe("#FFFF00");
    for (const downloaded of [
      await patchOriginalSpreadsheet(original, document, metadata),
      await exportSpreadsheet(document, metadata),
    ]) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(downloaded as unknown as ExcelJS.Buffer);
      const current = workbook.getWorksheet("Tabelle1")!;
      expect(current.getCell("C7").value).toBe("Lenas Änderung");
      expect(current.getCell("C2").fill).toEqual(
        expect.objectContaining({ fgColor: { argb: "FFFFFF00" } }),
      );
      expect(current.getCell("G4").fill).toEqual(
        expect.objectContaining({ fgColor: { argb: "FF17627F" } }),
      );
      expect(current.getCell("G10").master.address).toBe("C9");
    }
    document.destroy();
  });
  it("resolves the document's actual Office palette and bounded tints", () => {
    const palette = themeColors(
      strToU8(
        '<a:theme xmlns:a="urn:a"><a:themeElements><a:clrScheme><a:accent1><a:srgbClr val="17627F"/></a:accent1></a:clrScheme></a:themeElements></a:theme>',
      ),
    );
    expect(excelColor({ theme: 4 }, palette)).toBe("#17627F");
    expect(excelColor({ theme: 4, tint: 1 }, palette)).toBe("#FFFFFF");
    expect(excelColor({ theme: 4, tint: -1 }, palette)).toBe("#000000");
  });
  it("keeps earlier edits made in merged slave cells visible and present in the XLSX download", async () => {
    const original = await coloredSheet(),
      imported = await importDocument(original, "Alt.xlsx", "sheet");
    const document = mergedDocument([imported.state]),
      sheet = imported.metadata.sheets![0];
    document.getMap<Y.Map<string>>(SHEETS_MAP).get(sheet.id)!.set("9:4", "Frühere Ergänzung");
    expect(safeSheetMetadata(document, imported.metadata).sheets![0].merges).not.toContain(
      "C9:G10",
    );
    const downloaded = await patchOriginalSpreadsheet(original, document, imported.metadata),
      workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(downloaded as unknown as ExcelJS.Buffer);
    const current = workbook.getWorksheet("Tabelle1")!;
    expect(current.getCell("C9").value).toBe("Gemeinsam verbunden");
    expect(current.getCell("D9").value).toBe("Frühere Ergänzung");
    expect(current.getCell("D9").isMerged).toBe(false);
    document.destroy();
  });
  it("renders imported Word red text and blank Excel fills as actual PDF colors", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    async function colors(bytes: Buffer) {
      const loading = getDocument({
        data: new Uint8Array(bytes),
        standardFontDataUrl: `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`,
      });
      const pdf = await loading.promise;
      try {
        const page = await pdf.getPage(1),
          viewport = page.getViewport({ scale: 1 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)),
          context = canvas.getContext("2d");
        await page.render({ canvas: canvas as never, canvasContext: context as never, viewport })
          .promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const counts = { red: 0, yellow: 0, blue: 0 };
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 200 && pixels[i + 1] < 60 && pixels[i + 2] < 60) counts.red++;
          if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] < 10) counts.yellow++;
          if (
            Math.abs(pixels[i] - 23) < 3 &&
            Math.abs(pixels[i + 1] - 98) < 3 &&
            Math.abs(pixels[i + 2] - 127) < 3
          )
            counts.blue++;
        }
        return counts;
      } finally {
        await loading.destroy();
      }
    }
    const word = await importDocument(await coloredWord(), "Farben.docx", "text"),
      text = mergedDocument([word.state]);
    expect((await colors(await exportTextPdf(documentJson(text), "Farben"))).red).toBeGreaterThan(
      30,
    );
    text.destroy();
    const excel = await importDocument(await coloredSheet(), "Farben.xlsx", "sheet"),
      sheet = mergedDocument([excel.state]);
    const rendered = await colors(await exportSpreadsheetPdf(sheet, excel.metadata, "Farben"));
    expect(rendered.yellow).toBeGreaterThan(1000);
    expect(rendered.blue).toBeGreaterThan(1000);
    expect(rendered.red).toBeGreaterThan(10);
    sheet.destroy();
  }, 30_000);
});
