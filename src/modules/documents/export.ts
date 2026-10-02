import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { liveRedis, permissionEpochKey } from "@/platform/realtime/redis";
import { ensureSharedDocument, sourceBytes } from "./service";
import { readDocumentLog } from "./storage";
import { mergedDocument } from "./state";
import { documentJson, plainText } from "./presentation";
import { exportWord } from "./word-export";
import { exportSpreadsheet, exportSheetCsv } from "./sheet-export";
import { patchOriginalSpreadsheet, patchOriginalWord } from "./office-package";

export async function exportSharedDocument(
  context: Context,
  fileId: string,
  format: string,
  sheetId?: string,
) {
  const epoch = String(
    (await liveRedis().get<string>(permissionEpochKey(context.departmentId))) || "",
  );
  const { file, row } = await ensureSharedDocument(context, fileId);
  const log = await readDocumentLog(fileId, context.departmentId, epoch);
  const document = mergedDocument([log.state, ...log.entries.map((entry) => entry[1])]);
  const name = String(file.data.name).replace(/\.(?:docx|xlsx|csv|pdf)$/i, "");
  try {
    let bytes: Buffer, mime: string;
    if (row.format === "text" && ["docx", "pdf", "txt"].includes(format)) {
      const json = documentJson(document);
      if (format === "docx") {
        const generated = await exportWord(json, name);
        bytes = patchOriginalWord(await sourceBytes(String(file.data.path)), generated);
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (format === "txt") {
        bytes = Buffer.from(plainText(json), "utf8");
        mime = "text/plain; charset=utf-8";
      } else {
        const { exportTextPdf } = await import("./pdf-export");
        bytes = await exportTextPdf(json, name);
        mime = "application/pdf";
      }
    } else if (row.format === "sheet" && ["xlsx", "csv", "pdf"].includes(format)) {
      if (format === "xlsx") {
        bytes =
          file.data.mime === "text/csv"
            ? await exportSpreadsheet(document, row.metadata)
            : await patchOriginalSpreadsheet(
                await sourceBytes(String(file.data.path)),
                document,
                row.metadata,
              );
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (format === "csv") {
        bytes = Buffer.from(exportSheetCsv(document, row.metadata, sheetId), "utf8");
        mime = "text/csv; charset=utf-8";
      } else {
        const { exportSpreadsheetPdf } = await import("./pdf-export");
        bytes = await exportSpreadsheetPdf(document, row.metadata, name);
        mime = "application/pdf";
      }
    } else if (row.format === "pdf" && format === "pdf") {
      const { exportAnnotatedPdf } = await import("./pdf-export");
      bytes = await exportAnnotatedPdf(
        document,
        row.metadata,
        await sourceBytes(String(file.data.path)),
        name,
      );
      mime = "application/pdf";
    } else throw new HttpError(400, "Dieses Exportformat passt nicht zu diesem Dokument.");
    return { bytes, mime, name: `${name}.${format}` };
  } finally {
    document.destroy();
  }
}
