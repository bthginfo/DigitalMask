import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db, type Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { requireAdmin, type Context } from "@/platform/context";
import { auditChange, emit, scheduleEvents } from "@/platform/events";
import type { RecordData } from "@/shared/contracts";
import { HttpError } from "@/platform/http";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { analyzePortrait, type PortraitMetadata } from "./portrait-analysis";
import { isOwnedPortrait, selectActorPortrait } from "./portrait-selection";

/** Called with the actor row locked. Other records' photo links always remain valid. */
export async function normalizeActorPortrait(
  tx: Transaction,
  context: Context,
  actorId: string,
  data: RecordData,
  preferredId?: string,
) {
  const files = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        eq(records.kind, "files"),
        sql`${records.data}->>'recordId'=${actorId}`,
        sql`${records.data}->>'recordKind'='actors'`,
      ),
    )
    .for("update");
  const primary = selectActorPortrait(
    actorId,
    { ...data, portraitFileId: preferredId || data.portraitFileId },
    files,
  );
  const next: RecordData = {
    ...data,
    imageIds: primary ? [primary.id] : [],
    portraitFileId: primary?.id || "",
    portraitSourceUrl: primary?.data.sourceUrl || "",
    portraitCredit: primary?.data.credit || "",
  };
  let deletionQueued = false;
  for (const file of files.filter(
    (item) => isOwnedPortrait(item, actorId) && item.id !== primary?.id,
  )) {
    // A manually linked photo elsewhere is kept, even when no longer the actor's main portrait.
    const [reference] = await tx
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          ne(records.id, actorId),
          sql`jsonb_path_exists(${records.data}, '$.** ? (@ == $fileId)', jsonb_build_object('fileId', to_jsonb(${file.id}::text)))`,
        ),
      )
      .limit(1);
    if (reference) continue;
    await tx.delete(records).where(eq(records.id, file.id));
    if (file.data.path) {
      await emit(tx, context, "FileDeletionRequestedV1", { path: file.data.path, fileId: file.id });
      deletionQueued = true;
    }
  }
  return { data: next, deletionQueued };
}

/** Bounded admin maintenance for pre-existing photos. Already analyzed images are never reprocessed. */
export async function repairActorPortraits(context: Context, actorIds: string[]) {
  requireAdmin(context);
  const uniqueIds = [...new Set(actorIds)];
  if (!uniqueIds.length || uniqueIds.length > 4)
    throw new HttpError(400, "Bitte wähle bis zu vier Schauspieler.");
  const [actors, files] = await Promise.all([
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "actors"),
          inArray(records.id, uniqueIds),
        ),
      ),
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "files"),
          sql`${records.data}->>'recordKind'='actors'`,
          inArray(sql<string>`${records.data}->>'recordId'`, uniqueIds),
        ),
      ),
  ]);
  if (actors.length !== uniqueIds.length)
    throw new HttpError(404, "Ein Schauspieler wurde nicht gefunden.");
  const staged: { actorId: string; fileId: string; version: number; metadata: PortraitMetadata }[] =
    [];
  const errors: { actorId: string; error: string }[] = [];
  await Promise.all(
    actors.map(async (actor) => {
      const file = selectActorPortrait(actor.id, actor.data, files);
      if (!file || (file.data.portraitFocus as { version?: unknown } | undefined)?.version === 1)
        return;
      try {
        const blob = await get(String(file.data.path), { access: "private" });
        if (!blob || blob.statusCode !== 200) throw new Error("Missing image");
        const reader = blob.stream.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 4_000_000) throw new Error("Image limit");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const metadata = await analyzePortrait(Buffer.concat(chunks));
        staged.push({ actorId: actor.id, fileId: file.id, version: file.version, metadata });
      } catch {
        errors.push({
          actorId: actor.id,
          error: "Das vorhandene Porträt konnte nicht gelesen werden.",
        });
      }
    }),
  );
  let updated = 0,
    analyzed = 0,
    deletionQueued = false;
  await db.transaction(async (tx) => {
    for (const snapshot of actors.sort((a, b) => a.id.localeCompare(b.id))) {
      const [actor] = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "actors"),
            eq(records.id, snapshot.id),
          ),
        )
        .for("update");
      if (!actor) continue;
      const normalized = await normalizeActorPortrait(tx, context, actor.id, actor.data);
      deletionQueued ||= normalized.deletionQueued;
      const metadata = staged.find(
        (item) => item.actorId === actor.id && item.fileId === normalized.data.portraitFileId,
      );
      if (metadata) {
        const [file] = await tx
          .select()
          .from(records)
          .where(
            and(
              eq(records.id, metadata.fileId),
              eq(records.departmentId, context.departmentId),
              eq(records.kind, "files"),
              sql`${records.data}->>'recordId'=${actor.id}`,
            ),
          )
          .for("update");
        if (file && file.version === metadata.version) {
          await tx
            .update(records)
            .set({
              data: { ...file.data, ...metadata.metadata },
              version: file.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(records.id, file.id));
          analyzed++;
          await auditChange(tx, context, "actor.portrait-analyzed", actor.id);
        }
      }
      if (JSON.stringify(actor.data) !== JSON.stringify(normalized.data)) {
        await tx
          .update(records)
          .set({ data: normalized.data, version: actor.version + 1, updatedAt: new Date() })
          .where(eq(records.id, actor.id));
        updated++;
        await auditChange(tx, context, "actor.portrait-normalized", actor.id);
      }
    }
  });
  if (updated || analyzed || deletionQueued) invalidateWorkspace(context.departmentId);
  if (deletionQueued) scheduleEvents();
  return { updated, analyzed, errors };
}
