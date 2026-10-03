import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { type Context, requireAdmin } from "@/platform/context";
import { auditChange, scheduleEvents } from "@/platform/events";
import { HttpError } from "@/platform/http";
import { listValue } from "@/shared/contracts";
import { validateRecord, seasonSchema } from "@/modules/records/schemas";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { getEnsemble, getProfile, fetchTheatre, type EnsemblePerson } from "./source";
import { importedActorData, matchActor } from "./matching";
import { analyzePortrait, type PortraitMetadata } from "@/modules/files/portrait-analysis";
import { normalizeActorPortrait } from "@/modules/files/actor-portraits";
import { seasonForDate } from "@/shared/period-filter";

const actorScope = (context: Context) =>
  and(eq(records.departmentId, context.departmentId), eq(records.kind, "actors"));
export async function ensemblePreview(context: Context, targetSeason = seasonForDate()) {
  requireAdmin(context);
  const season = seasonSchema.parse(targetSeason);
  const [items, actors] = await Promise.all([
    getEnsemble(),
    db.select().from(records).where(actorScope(context)),
  ]);
  const entries = items.map((person) => {
    const match = matchActor(person, actors);
    return {
      sourceId: person.sourceId,
      name: person.name,
      action: match.action,
      recordId: match.actor?.id,
    };
  });
  return {
    items,
    entries,
    fetchedAt: new Date().toISOString(),
    season,
    summary: {
      create: entries.filter((x) => x.action === "create").length,
      update: entries.filter((x) => x.action === "update").length,
      conflict: entries.filter((x) => x.action === "conflict").length,
    },
  };
}
interface StagedPortrait {
  id: string;
  path: string;
  size: number;
  metadata: PortraitMetadata;
}
async function stagePortrait(context: Context, person: EnsemblePerson): Promise<StagedPortrait> {
  const response = await fetchTheatre(person.imageUrl, true);
  if (!/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.type))
    throw new HttpError(502, "Das Theaterfoto hat ein unbekanntes Bildformat.");
  const bytes = await sharp(response.bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const id = crypto.randomUUID(),
    path = `${context.organizationId}/${context.departmentId}/ensemble/${id}.webp`;
  const metadata = await analyzePortrait(bytes);
  await put(path, bytes, { access: "private", contentType: "image/webp", addRandomSuffix: false });
  return { id, path, size: bytes.length, metadata };
}
export async function importEnsemble(
  context: Context,
  sourceIds: string[],
  targetSeason = seasonForDate(),
) {
  requireAdmin(context);
  const season = seasonSchema.parse(targetSeason);
  const list = await getEnsemble();
  const selected = list.filter((person) => sourceIds.includes(person.sourceId));
  if (selected.length !== new Set(sourceIds).size)
    throw new HttpError(400, "Bitte lade die Ensemble-Vorschau neu.");
  const snapshot = await db.select().from(records).where(actorScope(context));
  const errors: { name: string; error: string }[] = [];
  const staged: { person: EnsemblePerson; portrait?: StagedPortrait }[] = [];
  // Four at most per request. No polling, source HTML is cached and all DB effects form one batch.
  await Promise.all(
    selected.map(async (item) => {
      const match = matchActor(item, snapshot);
      if (match.action === "conflict") {
        errors.push({
          name: item.name,
          error: "Mehrere passende Schauspieler vorhanden. Bitte zuerst im Katalog prüfen.",
        });
        return;
      }
      try {
        const person = await getProfile(item);
        let portrait: StagedPortrait | undefined;
        const old = match.actor?.data;
        if (
          person.imageUrl &&
          (old?.portraitSourceUrl !== person.imageUrl ||
            !listValue(old.imageIds).includes(String(old.portraitFileId)))
        ) {
          try {
            portrait = await stagePortrait(context, person);
          } catch {
            errors.push({
              name: person.name,
              error:
                "Die Angaben wurden übernommen, das Foto konnte nicht geladen werden. Bitte erneut importieren.",
            });
          }
        }
        staged.push({ person, portrait });
      } catch (error) {
        errors.push({
          name: item.name,
          error:
            error instanceof HttpError ? error.message : "Das Profil konnte nicht geladen werden.",
        });
      }
    }),
  );
  const usedPaths = new Set<string>();
  let created = 0,
    updated = 0,
    unchanged = 0,
    images = 0,
    deletionQueued = false;
  let committed = false;
  try {
    if (staged.length)
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`ensemble:${context.departmentId}`}))`,
        );
        const current = await tx.select().from(records).where(actorScope(context)).for("update");
        for (const { person, portrait } of staged) {
          const match = matchActor(person, current);
          if (match.action === "conflict") {
            errors.push({
              name: person.name,
              error: "Der Katalog wurde geändert; mehrere passende Schauspieler gefunden.",
            });
            continue;
          }
          const actor = match.actor,
            id = actor?.id || crypto.randomUUID();
          const data = importedActorData(person, actor?.data, season);
          // A simultaneous import may already have installed this photo while we were fetching.
          const usePortrait =
            portrait &&
            !(
              actor?.data.portraitSourceUrl === person.imageUrl &&
              listValue(actor.data.imageIds).includes(String(actor.data.portraitFileId))
            );
          if (usePortrait && portrait) {
            data.imageIds = [portrait.id];
            data.portraitFileId = portrait.id;
            data.portraitSourceUrl = person.imageUrl;
            data.portraitCredit = person.imageCredit;
            await tx.insert(records).values({
              id: portrait.id,
              kind: "files",
              organizationId: context.organizationId,
              departmentId: context.departmentId,
              createdBy: context.user.id,
              data: {
                name: `${person.name} – Theaterportrait.webp`,
                mime: "image/webp",
                size: portrait.size,
                image: true,
                recordKind: "actors",
                recordId: id,
                path: portrait.path,
                sourceUrl: person.imageUrl,
                credit: person.imageCredit,
                ...portrait.metadata,
              },
            });
            usedPaths.add(portrait.path);
            images++;
          }
          const normalized = await normalizeActorPortrait(tx, context, id, data);
          deletionQueued ||= normalized.deletionQueued;
          const validated = validateRecord("actors", normalized.data);
          if (
            actor &&
            JSON.stringify(validateRecord("actors", actor.data)) === JSON.stringify(validated)
          ) {
            unchanged++;
            continue;
          }
          if (actor) {
            await tx
              .update(records)
              .set({ data: validated, version: actor.version + 1, updatedAt: new Date() })
              .where(eq(records.id, id));
            updated++;
            actor.data = validated;
          } else {
            const [row] = await tx
              .insert(records)
              .values({
                id,
                kind: "actors",
                organizationId: context.organizationId,
                departmentId: context.departmentId,
                createdBy: context.user.id,
                data: validated,
              })
              .returning();
            current.push(row);
            created++;
          }
          await auditChange(tx, context, "actors.ensemble-imported", id);
        }
      });
    committed = true;
  } finally {
    // Compensate unused uploads and rollback uploads. Committed portrait replacements use the outbox.
    const unused = staged.flatMap((x) =>
      x.portrait && (!committed || !usedPaths.has(x.portrait.path)) ? [x.portrait.path] : [],
    );
    if (unused.length) await del(unused).catch(() => {});
  }
  if (created || updated) invalidateWorkspace(context.departmentId);
  if (deletionQueued) scheduleEvents();
  return { created, updated, unchanged, images, errors, season };
}
