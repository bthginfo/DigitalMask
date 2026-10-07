import sharp from "sharp";
import { put, get, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { findRecord, serialize } from "@/modules/records/repository";
import { assertRead, assertWrite } from "@/modules/records/service";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { emit, scheduleEvents, auditChange } from "@/platform/events";
import { listValue, type RecordKind } from "@/shared/contracts";
import { officeUpload } from "@/modules/documents/file-policy";
import { analyzePortrait, type PortraitMetadata } from "./portrait-analysis";
import { normalizeActorPortrait } from "./actor-portraits";
import { captureRecordOperation } from "@/modules/changes/operations";
import { acquireWorkflowLock } from "@/modules/workflows/locks";
export async function uploadFile(
  context: Context,
  file: File,
  recordKind: RecordKind,
  recordId: string,
) {
  const linked = await findRecord(context, recordId, recordKind);
  await assertRead(context, linked);
  assertWrite(context, recordKind, linked);
  if (file.size <= 0 || file.size > 4_000_000)
    throw new HttpError(
      413,
      "Bitte verwende Dateien bis 4 MB. Fotos werden vor dem Upload verkleinert.",
    );
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type;
  let image = false;
  let portrait: PortraitMetadata | undefined;
  let extension = "pdf";
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    try {
      bytes = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      mime = "image/webp";
      image = true;
      extension = "webp";
    } catch {
      throw new HttpError(400, "Dieses Bild konnte nicht gelesen werden.");
    }
  } else if (mime !== "application/pdf" || bytes.subarray(0, 5).toString() !== "%PDF-") {
    const office = officeUpload(bytes, file.name, mime);
    if (!office)
      throw new HttpError(
        400,
        "Erlaubt sind JPG, PNG, WebP, PDF, Word (DOCX), Excel (XLSX) und CSV.",
      );
    mime = office.mime;
    extension = office.extension;
  }
  const id = crypto.randomUUID();
  if (image && recordKind === "actors") portrait = await analyzePortrait(bytes);
  const path = `${context.organizationId}/${context.departmentId}/${recordKind}/${recordId}/${id}.${extension}`;
  await put(path, bytes, { access: "private", contentType: mime, addRandomSuffix: false });
  let deletionQueued = false;
  try {
    const result = await db.transaction(async (tx) => {
      const current = await findRecord(context, recordId, recordKind, tx, true);
      await assertRead(context, current, tx);
      assertWrite(context, recordKind, current);
      const [row] = await tx
        .insert(records)
        .values({
          id,
          kind: "files",
          organizationId: context.organizationId,
          departmentId: context.departmentId,
          createdBy: context.user.id,
          productionId: recordKind === "productions" ? recordId : current.productionId,
          data: {
            name: file.name.slice(0, 200),
            mime,
            size: bytes.length,
            recordKind,
            recordId,
            path,
            image,
            ...(portrait || {}),
          },
        })
        .returning();
      const field = recordKind === "messages" ? "attachmentIds" : "imageIds";
      if (image || recordKind === "messages") {
        let data = { ...current.data, [field]: [...listValue(current.data[field]), id] };
        if (image && recordKind === "actors") {
          const normalized = await normalizeActorPortrait(tx, context, recordId, data, id);
          data = normalized.data;
          deletionQueued = normalized.deletionQueued;
        }
        await tx
          .update(records)
          .set({
            data,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(records.id, recordId));
      }
      await auditChange(tx, context, "file.uploaded", id);
      return serialize(row);
    });
    invalidateWorkspace(context.departmentId);
    if (deletionQueued) scheduleEvents();
    return result;
  } catch (error) {
    await del(path).catch(() => {});
    throw error;
  }
}
export async function getFile(context: Context, id: string) {
  const row = await findRecord(context, id, "files");
  if (row.data.pendingDeletionOperation) throw new HttpError(404, "Die Datei wurde entfernt.");
  const linked = await findRecord(context, String(row.data.recordId), undefined);
  await assertRead(context, linked);
  const blob = await get(String(row.data.path), { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new HttpError(404, "Die Datei wurde nicht gefunden.");
  return { row, blob };
}
export async function deleteFile(context: Context, id: string) {
  const undo = await db.transaction(async (tx) => {
    let row = await findRecord(context, id, "files", tx);
    await acquireWorkflowLock(context, row.data.recordKind as RecordKind, tx);
    const linked = await findRecord(context, String(row.data.recordId), undefined, tx, true);
    row = await findRecord(context, id, "files", tx, true);
    if (row.data.pendingDeletionOperation)
      throw new HttpError(409, "Diese Datei wurde bereits entfernt.");
    await assertRead(context, linked, tx);
    assertWrite(context, linked.kind, linked);
    const field = linked.kind === "messages" ? "attachmentIds" : "imageIds";
    const data = { ...linked.data, [field]: listValue(linked.data[field]).filter((x) => x !== id) };
    if (linked.kind === "actors" && linked.data.portraitFileId === id) {
      data.portraitFileId = "";
      data.portraitSourceUrl = "";
      data.portraitCredit = "";
    }
    const [updated] = await tx
      .update(records)
      .set({
        data,
        version: linked.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(records.id, linked.id))
      .returning();
    const receipt = await captureRecordOperation(tx, context, linked, updated, {
      payload: { removedFile: serialize(row) },
    });
    if (!receipt) throw new HttpError(500, "Die Datei konnte nicht entfernt werden.");
    await tx
      .update(records)
      .set({
        data: { ...row.data, pendingDeletionOperation: receipt.id },
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(records.id, id));
    await emit(
      tx,
      context,
      "RecordDeletionFinalizedV1",
      { recordId: linked.id, fileId: row.id, operationId: receipt.id },
      { availableAt: new Date(receipt.expiresAt) },
    );
    await auditChange(tx, context, "file.deleted", id);
    return receipt;
  });
  invalidateWorkspace(context.departmentId);
  scheduleEvents();
  return undo;
}
