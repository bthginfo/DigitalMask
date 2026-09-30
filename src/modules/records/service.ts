import { and, eq, ne, sql, inArray, lt, gt } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { records, memberships, recordHistory } from "@/platform/db/schema";
import { requireAdmin, type Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { emit, auditChange, scheduleEvents } from "@/platform/events";
import {
  durationSeconds,
  localDay,
  splitAcrossDays,
  startOfLocalDay,
} from "@/modules/time-tracking/rules";
import { occurrences } from "@/modules/calendar/occurrences";
import { validateRecord } from "./schemas";
import { findRecord, assertProject, serialize } from "./repository";
import { invalidateWorkspace } from "./workspace";
import {
  type RecordKind,
  type RecordData,
  contactsValue,
  listValue,
  textValue,
} from "@/shared/contracts";
const adminKinds = new Set<RecordKind>([
  "productions",
  "actors",
  "characters",
  "casting",
  "sprints",
  "events",
  "templates",
]);
export async function assertRead(
  context: Context,
  row: typeof records.$inferSelect,
  tx: Transaction | typeof db = db,
) {
  await assertProject(context, row.data.productionId, tx);
  if (row.kind === "productions") await assertProject(context, row.id, tx);
  if (
    ["time", "timesheets", "leave", "notifications"].includes(row.kind) &&
    row.data.userId !== context.user.id &&
    context.user.role === "user"
  )
    throw new HttpError(403, "Dieser Eintrag ist privat.");
  if (
    row.kind === "looks" &&
    row.data.status !== "published" &&
    row.createdBy !== context.user.id &&
    context.user.role === "user"
  )
    throw new HttpError(403, "Dieser Entwurf ist privat.");
}
export function assertWrite(
  context: Context,
  kind: RecordKind,
  existing?: typeof records.$inferSelect,
) {
  if (["notifications", "timesheets", "files"].includes(kind))
    throw new HttpError(403, "Bitte verwende den dafür vorgesehenen Arbeitsablauf.");
  if (adminKinds.has(kind)) requireAdmin(context);
  if (existing && context.user.role === "user") {
    if (["time", "leave", "messages"].includes(kind) && existing.data.userId !== context.user.id)
      throw new HttpError(403, "Du kannst nur eigene Einträge bearbeiten.");
    if (
      kind === "tasks" &&
      existing.createdBy !== context.user.id &&
      !listValue(existing.data.assigneeIds).includes(context.user.id)
    )
      throw new HttpError(403, "Diese Aufgabe ist dir nicht zugeordnet.");
    if (kind === "looks" && existing.createdBy !== context.user.id)
      throw new HttpError(403, "Du kannst nur eigene Aufschriebe bearbeiten.");
  }
}
async function validateRelations(
  context: Context,
  kind: RecordKind,
  data: RecordData,
  tx: Transaction,
  recordId?: string,
) {
  await assertProject(context, data.productionId, tx);
  const ids = listValue(data.assigneeIds).concat(
    listValue(data.participantIds),
    listValue(data.memberIds),
  );
  if (ids.length) {
    const valid = await tx
      .select({ id: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.departmentId, context.departmentId),
          eq(memberships.status, "active"),
          inArray(memberships.userId, ids),
        ),
      );
    if (new Set(valid.map((x) => x.id)).size !== new Set(ids).size)
      throw new HttpError(400, "Eine ausgewählte Person gehört nicht zum aktiven Team.");
    if (data.productionId) {
      const project = await findRecord(context, String(data.productionId), "productions", tx);
      const permitted = listValue(project.data.memberIds);
      if (
        permitted.length &&
        valid.some((member) => member.role === "user" && !permitted.includes(member.id))
      )
        throw new HttpError(
          400,
          "Bitte nimm die ausgewählte Person zuerst in das Projektteam auf.",
        );
    }
  }
  for (const [field, target] of [
    ["actorId", "actors"],
    ["characterId", "characters"],
    ["sprintId", "sprints"],
    ["taskId", "tasks"],
    ["templateId", "templates"],
  ] as const) {
    const value = textValue(data[field]);
    if (value) {
      const targetRow = await findRecord(context, value, target, tx);
      await assertRead(context, targetRow, tx);
      if (targetRow.data.productionId && targetRow.data.productionId !== data.productionId)
        throw new HttpError(400, "Die Zuordnung gehört zu einer anderen Produktion.");
    }
  }
  for (const fileId of [...listValue(data.imageIds), ...listValue(data.attachmentIds)]) {
    const file = await findRecord(context, fileId, "files", tx);
    const linked = await findRecord(context, String(file.data.recordId), undefined, tx);
    await assertRead(context, linked, tx);
  }
  if (["characters", "casting", "sprints"].includes(kind) && !data.productionId)
    throw new HttpError(400, "Bitte wähle eine Produktion.");
  if (kind === "casting" && (!data.actorId || !data.characterId))
    throw new HttpError(400, "Bitte wähle Schauspieler und Figur.");
  if (kind === "tasks" && data.parentId) {
    let parent = String(data.parentId);
    for (let depth = 0; parent; depth++) {
      if (depth > 30 || parent === recordId)
        throw new HttpError(400, "Unteraufgaben dürfen keinen Kreis bilden.");
      const row = await findRecord(context, parent, "tasks", tx);
      if (row.data.productionId !== data.productionId)
        throw new HttpError(400, "Die Unteraufgabe gehört zu einer anderen Produktion.");
      parent = textValue(row.data.parentId);
    }
  }
  if (kind === "sprints" && String(data.end) < String(data.start))
    throw new HttpError(400, "Das Sprintende muss nach dem Beginn liegen.");
  if (kind === "leave" && String(data.end) < String(data.start))
    throw new HttpError(400, "Bitte prüfe den Zeitraum.");
  if (kind === "events") {
    if (new Date(String(data.end)) <= new Date(String(data.start)))
      throw new HttpError(400, "Das Ende muss nach dem Beginn liegen.");
    if (data.until && String(data.until) < localDay(String(data.start)))
      throw new HttpError(400, "Das Serienende liegt vor dem ersten Termin.");
    const selected = listValue(data.participantIds);
    if (selected.length) {
      const candidates = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "events"),
            recordId ? ne(records.id, recordId) : undefined,
          ),
        );
      const event = serialize({
        id: recordId || "candidate",
        kind,
        organizationId: context.organizationId,
        departmentId: context.departmentId,
        createdBy: context.user.id,
        ownerId: null,
        productionId: textValue(data.productionId) || null,
        parentId: null,
        startAt: new Date(String(data.start)),
        endAt: new Date(String(data.end)),
        data,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const horizon = new Date(String(data.end));
      horizon.setUTCDate(horizon.getUTCDate() + 90);
      const proposed = occurrences(event, new Date(String(data.start)), horizon);
      for (const row of candidates) {
        if (!listValue(row.data.participantIds).some((x) => selected.includes(x))) continue;
        const other = occurrences(serialize(row), new Date(String(data.start)), horizon);
        if (proposed.some((a) => other.some((b) => a.start < b.end && a.end > b.start)))
          throw new HttpError(
            409,
            `Zeitkonflikt mit „${row.data.title}“. Bitte passe die Planung an.`,
          );
      }
    }
  }
  if (kind === "time") {
    const owner = String(data.userId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":time:" + owner}))`,
    );
    if (Boolean(data.start) !== Boolean(data.end))
      throw new HttpError(400, "Beginn und Ende müssen gemeinsam angegeben werden.");
    if (data.start && data.end) {
      try {
        data.durationSeconds = durationSeconds(
          String(data.start),
          String(data.end),
          Number(data.pauseSeconds),
        );
        data.date = localDay(String(data.start));
        data.dayAllocations = splitAcrossDays(
          String(data.start),
          String(data.end),
          Number(data.pauseSeconds),
        );
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : "Bitte prüfe die Dauer.");
      }
      const overlap = await tx
        .select({ id: records.id })
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "time"),
            eq(records.ownerId, owner),
            recordId ? ne(records.id, recordId) : undefined,
            lt(records.startAt, new Date(String(data.end))),
            gt(records.endAt, new Date(String(data.start))),
          ),
        )
        .limit(1);
      if (overlap.length)
        throw new HttpError(409, "Diese Zeit überschneidet sich mit einer vorhandenen Buchung.");
    }
    const days = Array.isArray(data.dayAllocations)
      ? data.dayAllocations.map((x: unknown) => String((x as { date: string }).date))
      : [String(data.date)];
    const approved = await tx
      .select({ data: records.data })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "timesheets"),
          eq(records.ownerId, owner),
          sql`${records.data}->>'status'='approved'`,
        ),
      );
    for (const sheet of approved) {
      const begin = startOfLocalDay(String(sheet.data.week));
      const end = new Date(begin);
      end.setUTCDate(end.getUTCDate() + 7);
      if (days.some((d) => startOfLocalDay(d) >= begin && startOfLocalDay(d) < end))
        throw new HttpError(
          409,
          "Diese Woche ist freigegeben. Bitte fordere eine Korrektur bei einem Admin an.",
        );
    }
  }
}
export async function saveRecord(
  context: Context,
  kind: RecordKind,
  input: RecordData,
  existingId?: string,
  version?: number,
  options: { deferEffects?: boolean } = {},
) {
  let eventQueued = false;
  const result = await db.transaction(async (tx) => {
    const existing = existingId ? await findRecord(context, existingId, kind, tx, true) : undefined;
    assertWrite(context, kind, existing);
    if (existing) await assertRead(context, existing, tx);
    const data = validateRecord(kind, { ...existing?.data, ...input });
    if (kind === "productions") {
      // Resolve every team reference in the existing batched membership query.
      data.memberIds = Array.from(
        new Set([
          ...listValue(data.memberIds),
          ...contactsValue(data.contacts).flatMap((contact) =>
            contact.memberId ? [contact.memberId] : [],
          ),
        ]),
      );
      if (listValue(data.memberIds).length > 100)
        throw new HttpError(400, "Bitte wähle höchstens 100 Personen für das Produktionsteam.");
    }
    if (["time", "leave", "messages"].includes(kind))
      data.userId = existing?.data.userId || context.user.id;
    if (kind === "leave") {
      if (existing?.data.status === "approved")
        throw new HttpError(
          409,
          "Genehmigte Freiwünsche werden über die Adminentscheidung geändert.",
        );
      data.status = existing
        ? input.status === "withdrawn"
          ? "withdrawn"
          : existing.data.status
        : "pending";
    }
    if (kind === "templates" && existing) data.version = Number(existing.data.version || 1) + 1;
    if (kind === "time")
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":time:" + String(data.userId)}))`,
      );
    if (kind === "events")
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":calendar"}))`,
      );
    if (kind === "time" && data.idempotencyKey) {
      const [duplicate] = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.ownerId, context.user.id),
            eq(records.kind, "time"),
            sql`${records.data}->>'idempotencyKey'=${String(data.idempotencyKey)}`,
          ),
        )
        .limit(1);
      if (duplicate && !existing) return serialize(duplicate);
    }
    if (existing && kind === "time")
      await validateRelations(context, kind, { ...existing.data }, tx, existingId);
    await validateRelations(context, kind, data, tx, existingId);
    const values = {
      data,
      productionId: textValue(data.productionId) || null,
      ownerId: textValue(data.userId) || null,
      parentId: textValue(data.parentId) || null,
      startAt:
        data.start && ["time", "events"].includes(kind) ? new Date(String(data.start)) : null,
      endAt: data.end && ["time", "events"].includes(kind) ? new Date(String(data.end)) : null,
      updatedAt: new Date(),
    };
    let row: typeof records.$inferSelect;
    if (existing) {
      if (version !== existing.version)
        throw new HttpError(409, "Der Eintrag wurde inzwischen geändert. Bitte lade ihn neu.");
      const [updated] = await tx
        .update(records)
        .set({ ...values, version: existing.version + 1 })
        .where(and(eq(records.id, existing.id), eq(records.version, version)))
        .returning();
      if (!updated) throw new HttpError(409, "Der Eintrag wurde inzwischen geändert.");
      row = updated;
    } else {
      [row] = await tx
        .insert(records)
        .values({
          ...values,
          id: crypto.randomUUID(),
          kind,
          organizationId: context.organizationId,
          departmentId: context.departmentId,
          createdBy: context.user.id,
        })
        .returning();
    }
    await auditChange(tx, context, existing ? `${kind}.updated` : `${kind}.created`, row.id);
    if (kind === "looks" || kind === "templates")
      await tx
        .insert(recordHistory)
        .values({
          id: crypto.randomUUID(),
          recordId: row.id,
          version: row.version,
          data: row.data,
          createdBy: context.user.id,
        })
        .onConflictDoNothing();
    if (kind === "tasks") {
      const assigned = listValue(data.assigneeIds).filter(
        (x) => !listValue(existing?.data.assigneeIds).includes(x),
      );
      if (assigned.length) {
        await emit(tx, context, "TaskAssignedV1", {
          userIds: assigned,
          title: "Neue Aufgabe",
          body: String(data.title),
          link: data.productionId
            ? `/?module=productions&productionId=${encodeURIComponent(String(data.productionId))}&tab=tasks`
            : "/?module=tasks",
          recordId: row.id,
          productionId: data.productionId,
        });
        eventQueued = true;
      }
    }
    if (kind === "events" && listValue(data.participantIds).length) {
      await emit(tx, context, "ServiceChangedV1", {
        userIds: listValue(data.participantIds),
        title: existing ? "Dienst geändert" : "Neuer Dienst",
        body: String(data.title),
        link: "/?module=calendar",
        recordId: row.id,
        productionId: data.productionId,
      });
      eventQueued = true;
    }
    if (kind === "looks" && data.status === "published" && existing?.data.status !== "published") {
      const project = data.productionId
        ? await findRecord(context, String(data.productionId), "productions", tx)
        : undefined;
      const permitted = listValue(project?.data.memberIds);
      const audience = await tx
        .select({ id: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(
          and(eq(memberships.departmentId, context.departmentId), eq(memberships.status, "active")),
        );
      await emit(tx, context, "LookPublishedV1", {
        userIds: audience
          .filter(
            (member) =>
              !permitted.length || member.role !== "user" || permitted.includes(member.id),
          )
          .map((member) => member.id),
        title: "Neuer Aufschrieb",
        body: String(data.title),
        link: data.productionId
          ? `/?module=productions&productionId=${encodeURIComponent(String(data.productionId))}&tab=looks`
          : "/?module=documentation",
        recordId: row.id,
        productionId: data.productionId,
      });
      eventQueued = true;
    }
    return serialize(row);
  });
  if (!options.deferEffects) {
    invalidateWorkspace(context.departmentId);
    if (eventQueued) scheduleEvents();
  }
  return result;
}
export async function deleteRecord(context: Context, kind: RecordKind, id: string) {
  let eventQueued = false;
  await db.transaction(async (tx) => {
    const row = await findRecord(context, id, kind, tx, true);
    assertWrite(context, kind, row);
    await assertRead(context, row, tx);
    if (kind === "events" && row.data.leaveId)
      throw new HttpError(409, "Diese Abwesenheit wird über die Freiwunschentscheidung verwaltet.");
    if (kind === "time" || kind === "leave") {
      await validateRelations(context, kind, { ...row.data }, tx, id);
      if (kind === "leave" && row.data.status === "approved")
        throw new HttpError(409, "Genehmigte Abwesenheiten können nicht direkt gelöscht werden.");
    }
    const [dependent] = await tx
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          ne(records.id, id),
          ne(records.kind, "notifications"),
          sql`(${records.productionId}=${id} or ${records.parentId}=${id} or ${records.data}->>'actorId'=${id} or ${records.data}->>'characterId'=${id} or ${records.data}->>'sprintId'=${id} or ${records.data}->>'taskId'=${id} or ${records.data}->>'templateId'=${id})`,
        ),
      )
      .limit(1);
    if (dependent)
      throw new HttpError(
        409,
        "Der Eintrag wird noch verwendet. Entferne zuerst die Zuordnungen oder archiviere die Produktion.",
      );
    const attachments = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "files"),
          sql`${records.data}->>'recordId'=${id}`,
        ),
      );
    for (const file of attachments)
      await emit(tx, context, "FileDeletionRequestedV1", { path: file.data.path });
    eventQueued = attachments.length > 0;
    if (kind === "productions")
      await tx
        .delete(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "notifications"),
            eq(records.productionId, id),
          ),
        );
    await tx.delete(records).where(inArray(records.id, [id, ...attachments.map((f) => f.id)]));
    await auditChange(tx, context, `${kind}.deleted`, id);
  });
  invalidateWorkspace(context.departmentId);
  if (eventQueued) scheduleEvents();
}
