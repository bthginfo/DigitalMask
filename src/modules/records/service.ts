import { and, eq, ne, or, sql, inArray } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { records, memberships, recordHistory } from "@/platform/db/schema";
import { type Context } from "@/platform/context";
import { canManageRecord, canSetCalendarParticipants } from "@/shared/record-permissions";
import { HttpError } from "@/platform/http";
import { emit, auditChange, scheduleEvents } from "@/platform/events";
import { localDay } from "@/modules/time-tracking/rules";
import { validateBooking } from "@/modules/time-tracking/validation";
import { reopenCorrectedWeeks } from "@/modules/time-tracking/corrections";
import { occurrences } from "@/modules/calendar/occurrences";
import { assertConversation } from "@/modules/chat/permissions";
import { prepareConversation } from "@/modules/chat/conversations";
import { prepareProductionContacts } from "@/modules/people/production-contacts";
import { maskPlanValue } from "@/modules/mask-plans/model";
import { maskPlanMemberIdsToValidate, validateMaskPlanActors } from "@/modules/mask-plans/service";
import { personNameKey } from "@/shared/person-identity";
import {
  validateDomainCategory,
  assertUnusedDomainCategory,
  validateCategoryReferences,
} from "@/modules/categories/service";
import { lookTitle } from "@/shared/document-sections";
import { calendarPresentation, calendarCategoryBlocksTime } from "@/shared/calendar-categories";
import {
  validateCalendarCategory,
  assertUnusedCategory,
  normalizeEventCategory,
} from "@/modules/calendar/categories";
import { validateRecord } from "./schemas";
import { applySeasonDefaults } from "./season-defaults";
import { findRecord, assertProject, serialize } from "./repository";
import { invalidateWorkspace } from "./workspace";
import {
  type RecordKind,
  type RecordData,
  contactsValue,
  listValue,
  textValue,
} from "@/shared/contracts";
export async function assertRead(
  context: Context,
  row: typeof records.$inferSelect,
  tx: Transaction | typeof db = db,
) {
  await assertProject(context, row.data.productionId, tx);
  if (row.kind === "conversations") await assertConversation(context, row.id, tx);
  else await assertConversation(context, row.data.conversationId, tx);
  if (
    row.kind === "feedback" &&
    context.user.role !== "superadmin" &&
    row.data.userId !== context.user.id
  )
    throw new HttpError(403, "Diese Rückmeldung ist privat.");
  if (row.kind === "productions") await assertProject(context, row.id, tx);
  if (
    ["time", "attendance", "timesheets", "leave", "notifications"].includes(row.kind) &&
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
  if (
    kind === "messages" &&
    existing?.data.conversationId &&
    existing.data.userId !== context.user.id
  )
    throw new HttpError(403, "Du kannst nur eigene private Nachrichten bearbeiten.");
  if (
    kind === "conversations" &&
    existing &&
    existing.data.mode !== "team" &&
    existing.createdBy !== context.user.id
  )
    throw new HttpError(403, "Nur die Person, die diesen Chat angelegt hat, kann ihn verwalten.");
  if (
    kind === "feedback" &&
    existing &&
    context.user.role !== "superadmin" &&
    existing.data.userId !== context.user.id
  )
    throw new HttpError(403, "Du kannst nur eigene Rückmeldungen bearbeiten.");
  if (["notifications", "timesheets", "files"].includes(kind))
    throw new HttpError(403, "Bitte verwende den dafür vorgesehenen Arbeitsablauf.");
  if (!canManageRecord(context.user, kind, existing))
    throw new HttpError(403, "Du hast keine Berechtigung, diesen Eintrag zu verändern.");
  if (existing && context.user.role === "user") {
    if (
      ["time", "attendance", "leave", "messages"].includes(kind) &&
      existing.data.userId !== context.user.id
    )
      throw new HttpError(403, "Du kannst nur eigene Einträge bearbeiten.");
  }
}
async function validateRelations(
  context: Context,
  kind: RecordKind,
  data: RecordData,
  tx: Transaction,
  recordId?: string,
  previousMaskPlan?: ReturnType<typeof maskPlanValue>,
) {
  const production = await assertProject(context, data.productionId, tx);
  const maskPlan = kind === "maskPlans" ? maskPlanValue(data) : undefined;
  let eventTitle = textValue(data.title);
  let conversation: typeof records.$inferSelect | undefined;
  if (kind === "messages") {
    if (data.productionId && data.conversationId)
      throw new HttpError(400, "Bitte wähle genau einen Chat.");
    conversation = await assertConversation(context, data.conversationId, tx);
    if (conversation?.data.archived) throw new HttpError(409, "Dieser Chat ist archiviert.");
  }
  const ids = listValue(data.assigneeIds).concat(
    listValue(data.participantIds),
    listValue(data.memberIds),
    maskPlan ? maskPlanMemberIdsToValidate(maskPlan, previousMaskPlan) : [],
  );
  if (ids.length) {
    const valid = await tx
      .select({ id: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.departmentId, context.departmentId),
          eq(memberships.status, "active"),
          or(
            ne(memberships.role, "superadmin"),
            kind === "conversations" ? eq(memberships.userId, context.user.id) : undefined,
          ),
          inArray(memberships.userId, ids),
        ),
      );
    if (new Set(valid.map((x) => x.id)).size !== new Set(ids).size)
      throw new HttpError(400, "Eine ausgewählte Person gehört nicht zum aktiven Team.");
    // Makeup cover can be scheduled without changing the production's permanent team.
    if (data.productionId && !maskPlan) {
      const project =
        production || (await findRecord(context, String(data.productionId), "productions", tx));
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
  if (maskPlan) await validateMaskPlanActors(context, maskPlan, tx, previousMaskPlan);
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
      if (["looks", "casting"].includes(kind) && field === "actorId")
        data.actorName = targetRow.data.name;
      if (["looks", "casting"].includes(kind) && field === "characterId")
        data.characterName = targetRow.data.name;
      if (targetRow.data.productionId && targetRow.data.productionId !== data.productionId)
        throw new HttpError(400, "Die Zuordnung gehört zu einer anderen Produktion.");
    }
  }
  const fileIds = Array.from(
    new Set([...listValue(data.imageIds), ...listValue(data.attachmentIds)]),
  );
  if (fileIds.length) {
    const assets = await tx
      .select({ data: records.data })
      .from(records)
      .where(
        and(
          eq(records.departmentId, context.departmentId),
          eq(records.kind, "files"),
          inArray(records.id, fileIds),
        ),
      );
    if (assets.length !== fileIds.length)
      throw new HttpError(404, "Eine verknüpfte Datei wurde nicht gefunden.");
    const linkedIds = Array.from(new Set(assets.map((file) => String(file.data.recordId))));
    const linkedRecords = await tx
      .select()
      .from(records)
      .where(and(eq(records.departmentId, context.departmentId), inArray(records.id, linkedIds)));
    if (linkedRecords.length !== linkedIds.length)
      throw new HttpError(404, "Ein verknüpfter Eintrag wurde nicht gefunden.");
    for (const linked of linkedRecords) {
      await assertRead(context, linked, tx);
      if (linked.data.conversationId && linked.data.conversationId !== data.conversationId)
        throw new HttpError(400, "Private Chatdateien bleiben im zugehörigen Chat.");
    }
  }
  if (["characters", "casting", "sprints", "maskPlans"].includes(kind) && !data.productionId)
    throw new HttpError(400, "Bitte wähle eine Produktion.");
  if (
    kind === "casting" &&
    (!(data.actorId || data.actorName) || !(data.characterId || data.characterName))
  )
    throw new HttpError(400, "Bitte wähle Schauspieler und Figur oder trage deren Namen ein.");
  if (kind === "looks" && data.sections !== undefined && !(data.actorId || data.actorName))
    throw new HttpError(400, "Bitte wähle eine Schauspielperson oder trage ihren Namen ein.");
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
    const categoryName = await normalizeEventCategory(context, data, tx);
    eventTitle ||= textValue(production?.data.title) || categoryName;
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
            inArray(records.kind, ["events", "productions", "calendarCategories"]),
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
      const references = candidates.map(serialize);
      const calendarCategories = references.filter((item) => item.kind === "calendarCategories");
      for (const row of candidates) {
        if (row.kind !== "events") continue;
        if (
          !calendarCategoryBlocksTime(String(data.category), calendarCategories) ||
          !calendarCategoryBlocksTime(String(row.data.category), calendarCategories)
        )
          continue;
        if (!listValue(row.data.participantIds).some((x) => selected.includes(x))) continue;
        const other = occurrences(serialize(row), new Date(String(data.start)), horizon);
        if (proposed.some((a) => other.some((b) => a.start < b.end && a.end > b.start)))
          throw new HttpError(
            409,
            `Zeitkonflikt mit „${
              calendarPresentation(
                serialize(row),
                references.filter((item) => item.kind === "productions"),
                references.filter((item) => item.kind === "calendarCategories"),
              ).title
            }“. Bitte passe die Planung an.`,
          );
      }
    }
  }
  if (kind === "time" || kind === "attendance")
    await validateBooking(context, kind, data, tx, recordId);
  await validateCategoryReferences(context, kind, data, tx);
  return { conversation, eventTitle };
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
  assertWrite(context, kind);
  const result = await db.transaction(async (tx) => {
    // Same lock order as approval/linking and consolidation, before locking any production.
    if (["productions", "people"].includes(kind))
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`people:${context.departmentId}`}))`,
      );
    const existing = existingId ? await findRecord(context, existingId, kind, tx, true) : undefined;
    assertWrite(context, kind, existing);
    if (existing) await assertRead(context, existing, tx);
    const data = validateRecord(
      kind,
      applySeasonDefaults(kind, { ...existing?.data, ...input }, existing?.createdAt.toISOString()),
    );
    if (kind === "events" && !canSetCalendarParticipants(context.user, data))
      throw new HttpError(
        403,
        "Du kannst nur Einträge in deinem eigenen Kalender planen. Für andere Personen ist ein Admin zuständig.",
      );
    if (kind === "people") {
      if (existing?.data.linkedMemberId) data.linkedMemberId = existing.data.linkedMemberId;
      if (!existing) {
        const people = await tx
          .select({ data: records.data })
          .from(records)
          .where(and(eq(records.departmentId, context.departmentId), eq(records.kind, "people")));
        if (people.some((person) => personNameKey(person.data.name) === personNameKey(data.name)))
          throw new HttpError(
            409,
            "Diese Person ist bereits vorhanden. Bitte wähle den bestehenden Kontakt oder das Teammitglied.",
          );
      }
    }
    if (
      kind === "messages" &&
      existing &&
      (textValue(data.conversationId) !== textValue(existing.data.conversationId) ||
        textValue(data.productionId) !== textValue(existing.data.productionId))
    )
      throw new HttpError(
        400,
        "Eine Nachricht kann nicht in einen anderen Chat verschoben werden.",
      );
    if (kind === "conversations") {
      const duplicate = await prepareConversation(context, data, tx, existing);
      if (duplicate) {
        await assertRead(context, duplicate, tx);
        return serialize(duplicate);
      }
    }
    if (kind === "productions") {
      await prepareProductionContacts(context, data, tx, existing);
      // Resolve every team reference in the existing batched membership query.
      data.memberIds = Array.from(
        new Set([
          ...listValue(data.memberIds),
          ...contactsValue(data.contacts).flatMap((contact) =>
            contact.memberId ? [contact.memberId] : [],
          ),
        ]),
      );
      if (!existing && context.user.role === "user" && listValue(data.memberIds).length)
        data.memberIds = Array.from(new Set([...listValue(data.memberIds), context.user.id]));
      if (listValue(data.memberIds).length > 100)
        throw new HttpError(400, "Bitte wähle höchstens 100 Personen für das Produktionsteam.");
    }
    if (["time", "attendance", "leave", "messages"].includes(kind))
      data.userId = existing?.data.userId || context.user.id;
    if (kind === "feedback") {
      data.userId = existing?.data.userId || context.user.id;
      if (!existing || context.user.role !== "superadmin")
        data.status = existing?.data.status || "new";
    }
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
    if (kind === "calendarCategories") await validateCalendarCategory(context, data, tx, existing);
    if (kind === "categories") await validateDomainCategory(context, data, tx, existing);
    if (kind === "handovers") data.productionId = "";
    if (kind === "time" || kind === "attendance")
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":" + kind + ":" + String(data.userId)}))`,
      );
    if (kind === "events")
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${context.departmentId + ":calendar"}))`,
      );
    if ((kind === "time" || kind === "attendance") && data.idempotencyKey) {
      const [duplicate] = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.ownerId, context.user.id),
            eq(records.kind, kind),
            sql`${records.data}->>'idempotencyKey'=${String(data.idempotencyKey)}`,
          ),
        )
        .limit(1);
      if (duplicate && !existing) return serialize(duplicate);
    }
    const related = await validateRelations(
      context,
      kind,
      data,
      tx,
      existingId,
      kind === "maskPlans" && existing ? maskPlanValue(existing.data) : undefined,
    );
    if (kind === "looks" && (data.sections !== undefined || data.actorName)) {
      data.title = lookTitle(data);
      if (data.sections !== undefined) data.status = "published";
    }
    const values = {
      data,
      productionId: textValue(data.productionId) || null,
      ownerId: textValue(data.userId) || null,
      parentId: textValue(data.parentId) || null,
      startAt:
        data.start && ["time", "attendance", "events"].includes(kind)
          ? new Date(String(data.start))
          : null,
      endAt:
        data.end && ["time", "attendance", "events"].includes(kind)
          ? new Date(String(data.end))
          : null,
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
    if (kind === "time") await reopenCorrectedWeeks(context, tx, existing?.data, row.data);
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
    if (kind === "messages" && !existing) {
      const teamChannel = related.conversation?.data.mode === "team";
      await emit(tx, context, "ChatMessageCreatedV1", {
        // The worker resolves current team membership once, when delivering the message.
        userIds: teamChannel ? [] : listValue(related.conversation?.data.participantIds),
        audience: data.conversationId ? "conversation" : "team",
        title: teamChannel
          ? `Neue Nachricht · ${textValue(related.conversation?.data.title)}`
          : data.conversationId
            ? "Neue private Nachricht"
            : "Neue Nachricht",
        body: String(data.text).slice(0, 160),
        conversationId: data.conversationId,
        productionId: data.conversationId ? "" : data.productionId,
        recordId: row.id,
        link: data.conversationId
          ? `/?module=chat&conversationId=${encodeURIComponent(String(data.conversationId))}`
          : data.productionId
            ? `/?module=chat&productionId=${encodeURIComponent(String(data.productionId))}`
            : "/?module=chat",
      });
      eventQueued = true;
    }
    if (kind === "events" && listValue(data.participantIds).length) {
      await emit(tx, context, "ServiceChangedV1", {
        userIds: listValue(data.participantIds),
        title: existing ? "Dienst geändert" : "Neuer Dienst",
        body: related.eventTitle,
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
    if (kind === "calendarCategories")
      await assertUnusedCategory(context, String(row.data.key), tx);
    if (kind === "categories")
      await assertUnusedDomainCategory(context, String(row.data.scope), String(row.data.key), tx);
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
          sql`(${records.productionId}=${id} or ${records.parentId}=${id} or ${records.data}->>'actorId'=${id} or ${records.data}->>'characterId'=${id} or ${records.data}->>'sprintId'=${id} or ${records.data}->>'taskId'=${id} or ${records.data}->>'templateId'=${id} or ${records.data}->>'conversationId'=${id} or ${records.data}->'contacts' @> ${JSON.stringify([{ personId: id }])}::jsonb or (${records.kind}='maskPlans' and ${records.data}->'blocks' @> ${JSON.stringify([{ actorIds: [id] }])}::jsonb))`,
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
      await emit(tx, context, "FileDeletionRequestedV1", { path: file.data.path, fileId: file.id });
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
    if (kind === "time") await reopenCorrectedWeeks(context, tx, row.data);
    await auditChange(tx, context, `${kind}.deleted`, id);
  });
  invalidateWorkspace(context.departmentId);
  if (eventQueued) scheduleEvents();
}
