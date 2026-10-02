import * as Y from "yjs";
import { PDFDocument } from "pdf-lib";
import { HttpError } from "@/platform/http";
import { inspectOfficeArchive } from "./file-policy";
import { importWord } from "./text-import";
import { importSpreadsheet } from "./sheet-import";
import { encodeDocument } from "./state";
import {
  MAX_DOCUMENT_BYTES,
  PDF_NOTES,
  type DocumentFormat,
  type DocumentMetadata,
} from "./contracts";

export async function importDocument(
  bytes: Buffer,
  name: string,
  format: DocumentFormat,
  csv = false,
) {
  let document: Y.Doc;
  const metadata: DocumentMetadata = { sourceName: name, warnings: [] };
  if (format === "text") {
    inspectOfficeArchive(bytes, format);
    const imported = await importWord(bytes);
    document = imported.document;
    metadata.warnings = imported.warnings;
  } else if (format === "sheet") {
    if (!csv) inspectOfficeArchive(bytes, format);
    const imported = await importSpreadsheet(bytes, csv);
    document = imported.document;
    metadata.sheets = imported.sheets;
    metadata.warnings = imported.warnings;
  } else {
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes);
    } catch {
      throw new HttpError(
        400,
        "Dieses PDF ist beschädigt oder passwortgeschützt. Bitte lade eine lesbare Version hoch.",
      );
    }
    metadata.pdfPages = pdf.getPageCount();
    if (metadata.pdfPages > 500)
      throw new HttpError(413, "Bitte teile PDFs mit mehr als 500 Seiten auf.");
    document = new Y.Doc();
    document.getArray(PDF_NOTES);
    metadata.warnings = [
      "Das PDF bleibt unverändert. Gemeinsame Notizen werden beim Download als zusätzliche Seiten angefügt.",
    ];
  }
  try {
    const state = encodeDocument(document);
    if (Buffer.byteLength(state, "base64") > MAX_DOCUMENT_BYTES - 1_000_000)
      throw new HttpError(
        413,
        "Die bearbeitbare Datei ist zu groß. Bitte teile sie in kleinere Dateien auf.",
      );
    return { format, metadata, state };
  } finally {
    document.destroy();
  }
}
