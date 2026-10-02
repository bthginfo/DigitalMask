import { Unzip, UnzipInflate } from "fflate";
import { HttpError } from "@/platform/http";
import { documentMime, type DocumentFormat } from "./contracts";

export function inspectOfficeArchive(bytes: Uint8Array, format: "text" | "sheet") {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new HttpError(400, "Die Datei ist keine gültige Word- oder Excel-Datei.");
  let total = 0,
    count = 0;
  try {
    const archive: Record<string, Uint8Array> = {};
    let failure: unknown;
    const unzip = new Unzip((file) => {
      if (
        ++count > 1000 ||
        (file.originalSize || 0) > 8_000_000 ||
        /(?:^|\/)\.\.(?:\/|$)|^\/|\\|vbaProject\.bin/i.test(file.name)
      )
        throw new Error("archive limit");
      const chunks: Uint8Array[] = [];
      let size = 0;
      file.ondata = (error, data, final) => {
        if (failure) {
          file.terminate();
          return;
        }
        size += data?.length || 0;
        total += data?.length || 0;
        if (error || size > 8_000_000 || total > 25_000_000) {
          failure = error || new Error("archive limit");
          file.terminate();
          return;
        }
        chunks.push(data);
        if (final) {
          if (Object.hasOwn(archive, file.name)) {
            failure = new Error("duplicate archive path");
            return;
          }
          const content = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            content.set(chunk, offset);
            offset += chunk.length;
          }
          archive[file.name] = content;
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // Small compressed chunks bound actual inflation even if ZIP size headers lie.
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
      if (failure) throw failure;
    }
    const content = archive[format === "text" ? "word/document.xml" : "xl/workbook.xml"];
    if (!archive["[Content_Types].xml"] || !content) throw new Error("wrong Office format");
    // Prevent recursive XML entity expansion in third-party parsers.
    for (const [name, data] of Object.entries(archive)) {
      if (
        data.length > 8_000_000 ||
        (name.endsWith(".xml") && /<!DOCTYPE|<!ENTITY/i.test(new TextDecoder().decode(data)))
      )
        throw new Error("unsafe XML");
    }
    return archive;
  } catch {
    throw new HttpError(
      400,
      "Diese Office-Datei ist beschädigt, zu komplex oder enthält Makros. Bitte verwende eine normale DOCX- oder XLSX-Datei bis 4 MB.",
    );
  }
}

export function officeUpload(
  bytes: Buffer,
  name: string,
  mime: string,
): {
  format: DocumentFormat;
  mime: string;
  extension: string;
} | null {
  const extension = name.toLowerCase().split(".").at(-1);
  const format = extension === "docx" ? "text" : extension === "xlsx" ? "sheet" : null;
  if (format) {
    inspectOfficeArchive(bytes, format);
    return { format, mime: documentMime[format], extension: extension! };
  }
  if (
    extension === "csv" &&
    ["", "text/csv", "text/plain", "application/vnd.ms-excel"].includes(mime)
  ) {
    if (bytes.includes(0)) throw new HttpError(400, "CSV-Dateien müssen UTF-8-Text enthalten.");
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new HttpError(400, "Bitte speichere die CSV-Datei als UTF-8 und lade sie erneut hoch.");
    }
    return { format: "sheet", mime: "text/csv", extension: "csv" };
  }
  return null;
}
