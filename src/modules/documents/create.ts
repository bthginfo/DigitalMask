import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import { db } from "@/platform/db";
import { collaborativeDocuments } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { uploadFile, deleteFile } from "@/modules/files/service";
import type { RecordKind } from "@/shared/contracts";
import { documentMime } from "./contracts";
import { importDocument } from "./import";

export async function createSharedDocument(
  context: Context,
  input: { recordKind: RecordKind; recordId: string; name: string; format: "text" | "sheet" },
) {
  let bytes: Uint8Array;
  if (input.format === "text")
    bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("")] }] }));
  else {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Tabelle 1");
    bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  }
  const extension = input.format === "text" ? "docx" : "xlsx";
  const name = `${
    input.name
      .replace(/[\/\\\u0000-\u001f]/g, "")
      .replace(/\.(?:docx|xlsx)$/i, "")
      .trim() || "Neues Dokument"
  }.${extension}`;
  const imported = await importDocument(Buffer.from(bytes), name, input.format);
  const file = new File([new Uint8Array(bytes)], name, { type: documentMime[input.format] });
  const record = await uploadFile(context, file, input.recordKind, input.recordId);
  try {
    await db.insert(collaborativeDocuments).values({
      fileId: record.id,
      ...imported,
      metadata: { ...imported.metadata, warnings: [] },
      updatedBy: context.user.id,
    });
  } catch (error) {
    await deleteFile(context, record.id);
    throw error;
  }
  return record;
}
