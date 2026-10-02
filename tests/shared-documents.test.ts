import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, TextRun, Header, Footer, ImageRun } from "docx";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { strToU8, zipSync, unzipSync } from "fflate";
import { importDocument } from "@/modules/documents/import";
import { mergedDocument, encodeDocument, decodeState } from "@/modules/documents/state";
import { documentJson, plainText } from "@/modules/documents/presentation";
import { exportWord } from "@/modules/documents/word-export";
import { patchOriginalWord, patchOriginalSpreadsheet } from "@/modules/documents/office-package";
import { createSheetCalculator, displayCell } from "@/modules/documents/sheet-values";
import { exportSheetCsv } from "@/modules/documents/sheet-export";
import { htmlToTextJson } from "@/modules/documents/text-import";
import { inspectOfficeArchive } from "@/modules/documents/file-policy";
import { createDocumentTicket, verifyDocumentTicket } from "@/modules/documents/ticket";
import {
  exportTextPdf,
  exportSpreadsheetPdf,
  exportAnnotatedPdf,
} from "@/modules/documents/pdf-export";
import { SHEETS_MAP, PDF_NOTES } from "@/modules/documents/contracts";

async function word() {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#226655" } })
    .jpeg()
    .toBuffer();
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: { page: { margin: { left: 1440, right: 1440 } } },
          headers: { default: new Header({ children: [new Paragraph("Theater · Kopfzeile")] }) },
          footers: { default: new Footer({ children: [new Paragraph("Maskenabteilung")] }) },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Vorbereitung für die Perücke", bold: true })],
            }),
            new Paragraph("Probe um 10 Uhr"),
            new Paragraph({
              children: [
                new ImageRun({
                  data: image,
                  type: "jpg",
                  transformation: { width: 32, height: 32 },
                }),
              ],
            }),
          ],
        },
      ],
    }),
  );
}
async function spreadsheet() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stunden");
  sheet.getCell("A1").value = "Name";
  sheet.getCell("A2").value = "Lena";
  sheet.getCell("B2").value = 2;
  sheet.getCell("C2").value = 3;
  sheet.getCell("D2").value = { formula: "SUM(B2:C2)", result: 5 };
  sheet.getCell("A2").font = { bold: true, color: { argb: "FF226655" } };
  sheet.getColumn(1).width = 25;
  sheet.mergeCells("A4:B4");
  sheet.getCell("A4").value = "Notiz";
  workbook.addWorksheet("Material").getCell("A1").value = "Perücken";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("shared Office documents", () => {
  it("initializes a newly created blank spreadsheet", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Tabelle 1");
    const imported = await importDocument(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      "Neu.xlsx",
      "sheet",
    );
    expect(imported.metadata.sheets?.[0].name).toBe("Tabelle 1");
    const doc = mergedDocument([imported.state]);
    expect(doc.getMap(SHEETS_MAP).size).toBe(1);
    doc.destroy();
  });
  it("imports real Word content and preserves originals' header/footer parts in edited download", async () => {
    const source = await word(),
      imported = await importDocument(source, "Aufschrieb.docx", "text");
    const doc = mergedDocument([imported.state]);
    const json = documentJson(doc);
    expect(plainText(json)).toContain("Vorbereitung für die Perücke");
    expect(JSON.stringify(json)).toContain("data:image/jpeg;base64,");
    expect(json.content?.[0].content?.[0].marks?.some((mark) => mark.type === "bold")).toBe(true);
    json.content!.push({
      type: "paragraph",
      content: [{ type: "text", text: "Gemeinsam ergänzt" }],
    });
    const downloaded = patchOriginalWord(source, await exportWord(json, "Aufschrieb"));
    const result = await importDocument(downloaded, "Aufschrieb.docx", "text");
    const current = mergedDocument([result.state]);
    expect(plainText(documentJson(current))).toContain("Gemeinsam ergänzt");
    expect(JSON.stringify(documentJson(current))).toMatch(/data:image\/(?:png|jpeg);base64,/);
    const originalArchive = unzipSync(source),
      archive = unzipSync(downloaded);
    for (const name of Object.keys(originalArchive).filter((name) =>
      /word\/(?:header|footer)\d+\.xml/.test(name),
    ))
      expect(archive[name]).toEqual(originalArchive[name]);
    expect(new TextDecoder().decode(archive["word/document.xml"])).toContain("1440");
    doc.destroy();
    current.destroy();
  });
  it("merges simultaneous text changes without replacing another user's edit", () => {
    const initial = new Y.Doc();
    initial.getText("demo").insert(0, "Probe");
    const a = new Y.Doc(),
      b = new Y.Doc();
    const initialState = Y.encodeStateAsUpdate(initial);
    Y.applyUpdate(a, initialState);
    Y.applyUpdate(b, initialState);
    a.getText("demo").insert(0, "Heute: ");
    b.getText("demo").insert(5, " mit Maske");
    const result = mergedDocument([encodeDocument(initial), encodeDocument(a), encodeDocument(b)]);
    expect(result.getText("demo").toString()).toBe("Heute: Probe mit Maske");
    const before = result.getText("demo").toString();
    Y.applyUpdate(result, Y.encodeStateAsUpdate(a));
    expect(result.getText("demo").toString()).toBe(before);
    [initial, a, b, result].forEach((doc) => doc.destroy());
  });
  it("exports shared cell edits, recalculated formula cache, styles, merges and all sheets", async () => {
    const source = await spreadsheet(),
      imported = await importDocument(source, "Stunden.xlsx", "sheet");
    const doc = mergedDocument([imported.state]);
    const map = doc.getMap<Y.Map<string>>(SHEETS_MAP).get(imported.metadata.sheets![0].id)!;
    map.set("2:2", "7");
    map.set("2:3", "4");
    map.set("2:1", "Lena & Kollegin");
    map.set("5:1", "Neue Zeile");
    const bytes = await patchOriginalSpreadsheet(source, doc, imported.metadata);
    const current = new ExcelJS.Workbook();
    await current.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = current.getWorksheet("Stunden")!;
    expect(sheet.getCell("A2").value).toBe("Lena & Kollegin");
    expect(sheet.getCell("D2").result).toBe(11);
    expect(sheet.getCell("A5").value).toBe("Neue Zeile");
    expect(sheet.getCell("A2").font?.bold).toBe(true);
    expect(sheet.getColumn(1).width).toBe(25);
    expect(sheet.getCell("B4").isMerged).toBe(true);
    expect(current.getWorksheet("Material")?.getCell("A1").value).toBe("Perücken");
    expect(new TextDecoder().decode(unzipSync(bytes)["xl/workbook.xml"])).toContain(
      'fullCalcOnLoad="1"',
    );
    doc.destroy();
  });
  it("keeps unrelated XLSX package parts byte for byte", async () => {
    const archive = unzipSync(await spreadsheet());
    archive["customXml/item1.xml"] = strToU8("<original>Zusätzliche Metadaten</original>");
    const source = Buffer.from(zipSync(archive));
    const imported = await importDocument(source, "Datei.xlsx", "sheet"),
      doc = mergedDocument([imported.state]);
    doc.getMap<Y.Map<string>>(SHEETS_MAP).get(imported.metadata.sheets![0].id)!.set("2:2", "8");
    const result = unzipSync(await patchOriginalSpreadsheet(source, doc, imported.metadata));
    expect(result["customXml/item1.xml"]).toEqual(archive["customXml/item1.xml"]);
    expect(result["xl/styles.xml"]).toEqual(archive["xl/styles.xml"]);
    doc.destroy();
  });
  it("clears original values and keeps numeric-looking text as text", async () => {
    const source = await spreadsheet(),
      imported = await importDocument(source, "Datei.xlsx", "sheet"),
      doc = mergedDocument([imported.state]);
    const map = doc.getMap<Y.Map<string>>(SHEETS_MAP).get(imported.metadata.sheets![0].id)!;
    map.set("2:1", "");
    map.set("3:1", "'00123");
    const current = new ExcelJS.Workbook();
    await current.xlsx.load(
      (await patchOriginalSpreadsheet(source, doc, imported.metadata)) as unknown as ExcelJS.Buffer,
    );
    expect(current.getWorksheet("Stunden")!.getCell("A2").value).toBeNull();
    expect(current.getWorksheet("Stunden")!.getCell("A3").value).toBe("00123");
    doc.destroy();
  });
  it("evaluates German formulas, references across sheets, and safely stops circular formulas", () => {
    const doc = new Y.Doc(),
      sheets = doc.getMap<Y.Map<string>>(SHEETS_MAP),
      a = new Y.Map<string>(),
      b = new Y.Map<string>();
    sheets.set("1", a);
    sheets.set("2", b);
    a.set("1:1", "=SUMME(B1;C1)");
    a.set("1:2", "2");
    a.set("1:3", "=Material!A1");
    b.set("1:1", "3");
    const info = [
      { id: "1", name: "Stunden", rows: 40, columns: 10 },
      { id: "2", name: "Material", rows: 40, columns: 10 },
    ];
    expect(createSheetCalculator(sheets, info)("1", 1, 1)).toBe(5);
    a.set("2:1", "=A2");
    expect(String(createSheetCalculator(sheets, info)("1", 2, 1))).toMatch(/^#/);
    expect(displayCell(12.5)).toBe("12,5");
    doc.destroy();
  });
  it("exports only selected CSV sheet and escapes injected formulas", async () => {
    const source = await spreadsheet(),
      imported = await importDocument(source, "Datei.xlsx", "sheet"),
      doc = mergedDocument([imported.state]);
    const id = imported.metadata.sheets![1].id;
    doc.getMap<Y.Map<string>>(SHEETS_MAP).get(id)!.set("2:1", "'@malicious()");
    const csv = exportSheetCsv(doc, imported.metadata, id);
    expect(csv).toContain("Perücken");
    expect(csv).not.toContain("Lena");
    expect(csv).toContain("'@malicious()");
    doc.destroy();
  });
  it("creates readable multi-page PDFs and appends shared PDF notes without changing source pages", async () => {
    const text = {
      type: "doc",
      content: Array.from({ length: 120 }, (_, i) => ({
        type: "paragraph",
        content: [
          { type: "text", text: `Übergang ${i + 1}: Vorbereitung für Haare und Perücken.` },
        ],
      })),
    };
    const bytes = await exportTextPdf(text, "Aufschrieb"),
      sourcePdf = await PDFDocument.load(bytes);
    expect(sourcePdf.getPageCount()).toBeGreaterThan(1);
    const imported = await importDocument(bytes, "Plan.pdf", "pdf"),
      doc = mergedDocument([imported.state]);
    const note = new Y.Map<unknown>(),
      textNote = new Y.Text();
    note.set("id", "note1");
    note.set("page", 1);
    note.set("authorName", "Lena");
    note.set("text", textNote);
    doc.getArray(PDF_NOTES).push([note]);
    textNote.insert(0, "Bitte die Perücke bereitlegen.");
    const annotated = await PDFDocument.load(
      await exportAnnotatedPdf(doc, imported.metadata, bytes, "Plan"),
    );
    expect(annotated.getPageCount()).toBeGreaterThan(sourcePdf.getPageCount());
    expect(annotated.getPage(0).getSize()).toEqual(sourcePdf.getPage(0).getSize());
    doc.destroy();
  });
  it("prints wide sheets in labeled column bands", async () => {
    const source = await spreadsheet(),
      imported = await importDocument(source, "Datei.xlsx", "sheet"),
      doc = mergedDocument([imported.state]);
    doc
      .getMap<Y.Map<string>>(SHEETS_MAP)
      .get(imported.metadata.sheets![0].id)!
      .set("3:10", "Spalte J");
    const pdf = await PDFDocument.load(
      await exportSpreadsheetPdf(doc, imported.metadata, "Stunden"),
    );
    expect(pdf.getPageCount()).toBe(3); // 2 bands for Stunden + 1 Material
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    doc.destroy();
  });
});

describe("document privacy and untrusted uploads", () => {
  it("binds capabilities to a single document, session cookie, expiry and edit permission", () => {
    const previous = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "test-document-key";
    try {
      const ticket = createDocumentTicket(
        {
          fileId: "file",
          departmentId: "dept",
          userId: "user",
          canEdit: false,
          format: "text",
          epoch: "abc",
        },
        "better-auth.session_token=session",
        1000,
      );
      expect(
        verifyDocumentTicket(ticket.ticket, "better-auth.session_token=session", "file", 1001)
          .canEdit,
      ).toBe(false);
      expect(() =>
        verifyDocumentTicket(ticket.ticket, "better-auth.session_token=other", "file", 1001),
      ).toThrow();
      expect(() =>
        verifyDocumentTicket(ticket.ticket, "better-auth.session_token=session", "another", 1001),
      ).toThrow();
      expect(() =>
        verifyDocumentTicket(
          ticket.ticket,
          "better-auth.session_token=session",
          "file",
          ticket.expiresAt,
        ),
      ).toThrow();
      expect(() =>
        verifyDocumentTicket(
          `${ticket.ticket}x`,
          "better-auth.session_token=session",
          "file",
          1001,
        ),
      ).toThrow();
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = previous;
    }
  });
  it("removes executable HTML, remote image references and unsafe links before import", () => {
    const json = htmlToTextJson(
      '<p>Hallo <strong>Team</strong><script>alert(1)</script><a href="javascript:alert(1)">Link</a><img src="https://tracker.invalid/image"/></p>',
    );
    expect(plainText(json)).toBe("Hallo TeamLink");
    expect(JSON.stringify(json)).not.toMatch(/javascript|tracker|alert/);
  });
  it("rejects archives with macros, traversal paths, entity declarations or an inflated body", () => {
    const minimal = {
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("<doc/>"),
    };
    const extras: Record<string, Uint8Array>[] = [
      { "word/vbaProject.bin": strToU8("macro") },
      { "../outside": strToU8("x") },
      { "word/document.xml": strToU8('<!DOCTYPE d [<!ENTITY x "x">]><d/>') },
      { "word/document.xml": new Uint8Array(8_000_001) },
    ];
    for (const extra of extras)
      expect(() => inspectOfficeArchive(zipSync({ ...minimal, ...extra }), "text")).toThrow();
  });
  it("rejects invalid or oversized CRDT payloads before storage", () => {
    expect(() => decodeState("not a state")).toThrow();
    expect(() => decodeState(Buffer.alloc(260_000).toString("base64"), 256_000)).toThrow();
  });
});
