import { and, eq } from "drizzle-orm";
import * as Y from "yjs";
import { get } from "@vercel/blob";
import { db } from "@/platform/db";
import { collaborativeDocuments } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { liveConfigured } from "@/platform/realtime";
import { liveRedis, permissionEpochKey } from "@/platform/realtime/redis";
import { findRecord } from "@/modules/records/repository";
import { assertRead, assertWrite } from "@/modules/records/service";
import { assertConversation } from "@/modules/chat/permissions";
import { importDocument } from "./import";
import { documentFormat } from "./contracts";
import { createDocumentTicket, type DocumentClaims } from "./ticket";
import {
  acknowledgeCheckpoint,
  initializeDocumentCache,
  readDocumentLog,
  readDocumentState,
  clearDocumentCache,
  dirtyDocumentsKey,
  appendDocumentUpdate,
} from "./storage";
import { decodeState, encodeDocument, mergedDocument } from "./state";
import { inspectOfficeArchive } from "./file-policy";
import { restoreWordFormatting, wordStyleParagraphs } from "./word-formatting";
import { upgradeSheetMetadata, safeSheetMetadata } from "./format-upgrade";
import { notifyDocument } from "./live";

export async function sourceBytes(path: string) {
  const blob = await get(path, { access: "private" });
  if (!blob || blob.statusCode !== 200)
    throw new HttpError(404, "Die Originaldatei wurde nicht gefunden.");
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}
async function documentAccess(context: Context, id: string) {
  const file = await findRecord(context, id, "files");
  if (file.data.pendingDeletionOperation) throw new HttpError(404, "Die Datei wurde entfernt.");
  const parent = await findRecord(context, String(file.data.recordId));
  await assertRead(context, parent);
  const format = documentFormat(file.data.mime);
  if (!format)
    throw new HttpError(400, "Gemeinsam bearbeiten kannst du Word, Excel, CSV und PDF-Notizen.");
  let canEdit = true;
  if (parent.kind === "messages") {
    const conversation = await assertConversation(context, parent.data.conversationId);
    canEdit = conversation?.data.archived !== true;
  } else {
    try {
      assertWrite(context, parent.kind, parent);
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) canEdit = false;
      else throw error;
    }
  }
  return { file, format, canEdit };
}
export async function ensureSharedDocument(context: Context, id: string) {
  const access = await documentAccess(context, id);
  const query = () =>
    db.select().from(collaborativeDocuments).where(eq(collaborativeDocuments.fileId, id)).limit(1);
  let [row] = await query();
  if (!row) {
    const imported = await importDocument(
      await sourceBytes(String(access.file.data.path)),
      String(access.file.data.name),
      access.format,
      access.file.data.mime === "text/csv",
    );
    const [created] = await db
      .insert(collaborativeDocuments)
      .values({
        fileId: id,
        ...imported,
        updatedBy: context.user.id,
      })
      .onConflictDoNothing()
      .returning();
    // Two simultaneous first opens must use the SAME initial CRDT, never merge two imports.
    row = created || (await query())[0];
  }
  await initializeDocumentCache(id, row.state, row.checkpointRevision);
  if (row.metadata.formattingVersion !== 1 && access.format !== "pdf") {
    const bytes = await sourceBytes(String(access.file.data.path));
    const source =
      access.format === "sheet"
        ? await importDocument(
            bytes,
            String(access.file.data.name),
            "sheet",
            access.file.data.mime === "text/csv",
          )
        : null;
    const ranges =
      access.format === "text" ? wordStyleParagraphs(inspectOfficeArchive(bytes, "text")) : [];
    const epoch = String(
      (await liveRedis().get<string>(permissionEpochKey(context.departmentId))) || "",
    );
    // Serialise this one-time upgrade with normal checkpoints, without replacing pending edits.
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(collaborativeDocuments)
        .where(eq(collaborativeDocuments.fileId, id))
        .limit(1)
        .for("update");
      if (!current) throw new HttpError(404, "Das Dokument wurde gelöscht.");
      if (current.metadata.formattingVersion === 1) return { row: current, changed: false };
      let metadata = source
        ? upgradeSheetMetadata(current.metadata, source.metadata)
        : {
            ...current.metadata,
            formattingVersion: 1 as const,
            warnings: [
              "Text, Schriftfarben, einfache Schriftformate, Überschriften, Listen, Bilder und einfache Tabellen werden übernommen. Seitenlayout, Kopf-/Fußzeilen und besondere Word-Funktionen können abweichen. Das Original bleibt verfügbar.",
              ...current.metadata.warnings.filter((warning) => !warning.startsWith("Text, ")),
            ],
          };
      if (source) {
        await initializeDocumentCache(id, current.state, current.checkpointRevision);
        const log = await readDocumentLog(id, context.departmentId, epoch);
        const document = mergedDocument([log.state, ...log.entries.map((entry) => entry[1])]);
        try {
          metadata = safeSheetMetadata(document, metadata);
        } finally {
          document.destroy();
        }
      }
      if (Buffer.byteLength(JSON.stringify(metadata)) > 1_500_000)
        throw new HttpError(
          413,
          "Die Dokumentformatierung ist zu groß. Bitte teile die Datei auf.",
        );
      let state = current.state,
        revision = current.checkpointRevision,
        changed = false;
      if (ranges.length) {
        await initializeDocumentCache(id, current.state, current.checkpointRevision);
        const log = await readDocumentLog(id, context.departmentId, epoch);
        const document = mergedDocument([log.state, ...log.entries.map((entry) => entry[1])]);
        try {
          const vector = Y.encodeStateVector(document);
          if (restoreWordFormatting(document, ranges)) {
            const update = Buffer.from(Y.encodeStateAsUpdate(document, vector)).toString("base64");
            const appended = await appendDocumentUpdate(
              {
                fileId: id,
                departmentId: context.departmentId,
                userId: context.user.id,
                format: "text",
                canEdit: true,
                epoch,
                binding: "",
                expiresAt: Date.now() + 60_000,
              },
              update,
              log.revision,
            );
            // Include any concurrently appended edits before committing the new checkpoint.
            Y.applyUpdate(document, decodeState(appended.state));
            state = encodeDocument(document);
            revision = appended.revision;
            changed = true;
          }
        } finally {
          document.destroy();
        }
      }
      const [updated] = await tx
        .update(collaborativeDocuments)
        .set({ metadata, state, checkpointRevision: revision })
        .where(eq(collaborativeDocuments.fileId, id))
        .returning();
      return { row: updated, changed };
    });
    row = result.row;
    if (result.changed) {
      await acknowledgeCheckpoint(id, row.state, row.checkpointRevision);
      notifyDocument(id, row.checkpointRevision);
    }
  }
  return { ...access, row };
}
export async function openDocument(context: Context, id: string, cookie: string) {
  if (!liveConfigured())
    throw new HttpError(
      503,
      "Gemeinsames Bearbeiten ist gerade nicht erreichbar. Das Original kannst du weiterhin herunterladen.",
    );
  const epoch = String(
    (await liveRedis().get<string>(permissionEpochKey(context.departmentId))) || "",
  );
  const { row, file, canEdit } = await ensureSharedDocument(context, id);
  const currentEpoch = String(
    (await liveRedis().get<string>(permissionEpochKey(context.departmentId))) || "",
  );
  if (currentEpoch !== epoch)
    throw new HttpError(
      409,
      "Die Zugriffsrechte werden gerade aktualisiert. Bitte öffne das Dokument erneut.",
      { code: "document_session_expired" },
    );
  const claims = {
    fileId: id,
    departmentId: context.departmentId,
    userId: context.user.id,
    format: row.format,
    canEdit,
    epoch,
  };
  const access = createDocumentTicket(claims, cookie);
  const state = await readDocumentState({ ...claims, binding: "", expiresAt: access.expiresAt });
  let metadata = row.metadata;
  if (row.format === "sheet") {
    const document = mergedDocument([state.state]);
    try {
      metadata = safeSheetMetadata(document, metadata);
    } finally {
      document.destroy();
    }
  }
  return {
    ...state,
    fileId: id,
    name: String(file.data.name),
    format: row.format,
    metadata,
    canEdit,
    access,
  };
}

/** Serialized by a row lock; Redis cleanup happens only AFTER the SQL commit. */
export async function checkpointDocument(
  id: string,
  departmentId: string,
  claims?: DocumentClaims,
) {
  if (claims && !claims.canEdit) throw new HttpError(403, "Dieses Dokument kannst du nur ansehen.");
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(collaborativeDocuments)
      .where(eq(collaborativeDocuments.fileId, id))
      .limit(1)
      .for("update");
    if (!row) throw new HttpError(404, "Das Dokument wurde gelöscht.");
    await initializeDocumentCache(id, row.state, row.checkpointRevision);
    const log = await readDocumentLog(id, departmentId, claims?.epoch);
    if (log.revision <= row.checkpointRevision)
      return { state: row.state, revision: row.checkpointRevision };
    const document = mergedDocument([log.state, ...log.entries.map((entry) => entry[1])]);
    try {
      const state = encodeDocument(document);
      const updatedBy = log.entries.at(-1)?.[2] || row.updatedBy;
      await tx
        .update(collaborativeDocuments)
        .set({ state, checkpointRevision: log.revision, updatedBy, updatedAt: new Date() })
        .where(
          and(
            eq(collaborativeDocuments.fileId, id),
            eq(collaborativeDocuments.checkpointRevision, row.checkpointRevision),
          ),
        );
      return { state, revision: log.revision };
    } finally {
      document.destroy();
    }
  });
  await acknowledgeCheckpoint(id, result.state, result.revision);
  return { revision: result.revision };
}

/** Existing daily cron recovers the final batch even after a tab/device closes abruptly. */
export async function checkpointDirtyDocuments() {
  if (!liveConfigured()) return { saved: 0, failed: 0 };
  const dirty = await liveRedis().smembers<string[]>(dirtyDocumentsKey);
  if (!dirty.length) return { saved: 0, failed: 0 };
  const { records } = await import("@/platform/db/schema");
  let saved = 0,
    failed = 0;
  for (const id of dirty.slice(0, 40)) {
    try {
      const [file] = await db
        .select({ departmentId: records.departmentId })
        .from(records)
        .where(and(eq(records.id, id), eq(records.kind, "files")))
        .limit(1);
      if (!file) {
        await clearDocumentCache(id);
        continue;
      }
      await checkpointDocument(id, file.departmentId);
      saved++;
    } catch {
      failed++;
      console.error("Document checkpoint retry deferred");
    }
  }
  return { saved, failed };
}
