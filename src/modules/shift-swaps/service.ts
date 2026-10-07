import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type Transaction } from "@/platform/db";
import { memberships, records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { auditChange, emit, scheduleEvents } from "@/platform/events";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { acquireWorkflowLock } from "@/modules/workflows/locks";
import { calendarPresentation } from "@/shared/calendar-categories";
import { listValue, textValue, type RecordData } from "@/shared/contracts";
import { localDay } from "@/modules/time-tracking/rules";
import {
  createShiftSwapSchema,
  shiftSwapActionSchema,
  shiftSwapSchema,
  type ShiftSwapData,
} from "./schema";
import {
  canReadShiftSwap,
  findSwapConflict,
  replacementParticipants,
  selectedSwapOccurrence,
  shiftSwapTransition,
  type SwapTransfer,
} from "./rules";

type Row = typeof records.$inferSelect;
type Staff = { id: string; role: "user" | "admin" | "superadmin" };

async function activePeople(context: Context, ids: string[], tx: Transaction) {
  const people = await tx
    .select({ id: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.departmentId, context.departmentId),
        eq(memberships.status, "active"),
        ne(memberships.role, "superadmin"),
        inArray(memberships.userId, [...new Set(ids)]),
      ),
    )
    .orderBy(memberships.userId)
    .for("share");
  if (people.length !== new Set(ids).size)
    throw new HttpError(409, "Eine ausgewählte Person gehört nicht mehr zum aktiven Maskenteam.");
  return people;
}

async function assertServiceAccess(
  context: Context,
  service: Row,
  people: Staff[],
  tx: Transaction,
) {
  if (service.organizationId !== context.organizationId)
    throw new HttpError(404, "Der Dienst wurde nicht gefunden.");
  const productionId = textValue(service.data.productionId);
  if (!productionId) return;
  // Prevent a production-team edit racing an approval after access validation.
  const project = await findRecord(context, productionId, "productions", tx, true);
  const permitted = listValue(project.data.memberIds);
  if (
    permitted.length &&
    people.some((person) => person.role === "user" && !permitted.includes(person.id))
  )
    throw new HttpError(
      403,
      "Beide Personen müssen Zugriff auf die Produktion dieses Dienstes haben. Bitte lasse die Projektzuordnung prüfen.",
    );
}

function peopleForService(people: Staff[], service: Row, requesterId: string, partnerId: string) {
  const ids = new Set([...listValue(service.data.participantIds), requesterId, partnerId]);
  return people.filter((person) => ids.has(person.id));
}

async function planning(context: Context, tx: Transaction) {
  return tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        inArray(records.kind, ["events", "calendarCategories", "productions"]),
      ),
    );
}

/** Lock every referenced event in stable ID order before touching its data. */
async function lockedServices(context: Context, ids: string[], tx: Transaction) {
  const found = new Map<string, Row>();
  for (const id of [...new Set(ids.filter(Boolean))].sort())
    found.set(id, await findRecord(context, id, "events", tx, true));
  return found;
}

async function insertSwap(context: Context, data: ShiftSwapData, tx: Transaction) {
  const [row] = await tx
    .insert(records)
    .values({
      id: crypto.randomUUID(),
      kind: "shiftSwaps",
      organizationId: context.organizationId,
      departmentId: context.departmentId,
      createdBy: context.user.id,
      ownerId: data.requesterId,
      data,
    })
    .returning();
  await auditChange(tx, context, "shiftSwaps.created", row.id);
  return row;
}

async function updateRow(context: Context, before: Row, data: RecordData, tx: Transaction) {
  const [after] = await tx
    .update(records)
    .set({
      data,
      version: before.version + 1,
      updatedAt: new Date(),
      ...(before.kind === "events"
        ? {
            startAt: new Date(String(data.start)),
            endAt: new Date(String(data.end)),
          }
        : {}),
    })
    .where(and(eq(records.id, before.id), eq(records.version, before.version)))
    .returning();
  if (!after)
    throw new HttpError(409, "Der Eintrag wurde inzwischen geändert. Bitte lade ihn neu.");
  await auditChange(tx, context, `${before.kind}.updated`, after.id);
  return after;
}

async function notifySwap(context: Context, row: Row, tx: Transaction) {
  const data = shiftSwapSchema.parse(row.data);
  const targets = new Set([data.requesterId, data.partnerId]);
  if (data.status === "awaiting_admin") {
    const admins = await tx
      .select({ id: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.departmentId, context.departmentId),
          eq(memberships.status, "active"),
          ne(memberships.role, "user"),
        ),
      );
    for (const person of admins) targets.add(person.id);
  }
  const titles = {
    awaiting_partner: "Neue Diensttausch-Anfrage",
    awaiting_admin: "Diensttausch wartet auf Freigabe",
    approved: "Diensttausch genehmigt",
    declined: "Diensttausch abgelehnt",
    rejected: "Diensttausch nicht freigegeben",
    withdrawn: "Diensttausch zurückgezogen",
  };
  await emit(tx, context, "ShiftSwapChangedV1", {
    userIds: [...targets],
    title: titles[data.status],
    body: `${data.serviceTitle} · ${new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(data.serviceStart))}`,
    recordId: row.id,
    link: `/?module=calendar&swapId=${encodeURIComponent(row.id)}`,
  });
}

export async function createShiftSwap(context: Context, input: unknown) {
  const data = createShiftSwapSchema.parse(input);
  if (data.partnerId === context.user.id)
    throw new HttpError(400, "Bitte wähle eine andere Person.");
  const result = await db.transaction(async (tx) => {
    await acquireWorkflowLock(context, "shiftSwaps", tx);
    const services = await lockedServices(context, [data.serviceId, data.counterServiceId], tx);
    const people = await activePeople(
      context,
      [
        context.user.id,
        data.partnerId,
        ...[...services.values()].flatMap((service) => listValue(service.data.participantIds)),
      ],
      tx,
    );
    const service = services.get(data.serviceId)!;
    if (service.version !== data.serviceVersion)
      throw new HttpError(409, "Dein Dienst wurde geändert. Bitte wähle ihn erneut.");
    await assertServiceAccess(
      context,
      service,
      peopleForService(people, service, context.user.id, data.partnerId),
      tx,
    );
    const calendar = (await planning(context, tx)).map(serialize);
    const categories = calendar.filter((row) => row.kind === "calendarCategories");
    const productions = calendar.filter((row) => row.kind === "productions");
    const occurrence = selectedSwapOccurrence(
      serialize(service),
      data.serviceStart,
      context.user.id,
      categories,
    );
    replacementParticipants(serialize(service), context.user.id, data.partnerId);
    let counter: Row | undefined;
    let counterOccurrence: ReturnType<typeof selectedSwapOccurrence> | undefined;
    if (data.counterServiceId) {
      counter = services.get(data.counterServiceId)!;
      if (counter.version !== data.counterServiceVersion)
        throw new HttpError(409, "Der Gegendienst wurde geändert. Bitte wähle ihn erneut.");
      await assertServiceAccess(
        context,
        counter,
        peopleForService(people, counter, context.user.id, data.partnerId),
        tx,
      );
      counterOccurrence = selectedSwapOccurrence(
        serialize(counter),
        data.counterServiceStart,
        data.partnerId,
        categories,
      );
      replacementParticipants(serialize(counter), data.partnerId, context.user.id);
    }
    const pending = await tx
      .select({ data: records.data })
      .from(records)
      .where(and(eq(records.departmentId, context.departmentId), eq(records.kind, "shiftSwaps")));
    const selectedReferences = [
      { id: service.id, start: occurrence.start.toISOString() },
      ...(counter && counterOccurrence
        ? [{ id: counter.id, start: counterOccurrence.start.toISOString() }]
        : []),
    ];
    if (
      pending.some(
        (row) =>
          ["awaiting_partner", "awaiting_admin"].includes(textValue(row.data.status)) &&
          selectedReferences.some(
            (ref) =>
              (row.data.serviceId === ref.id && row.data.serviceStart === ref.start) ||
              (row.data.counterServiceId === ref.id && row.data.counterServiceStart === ref.start),
          ),
      )
    )
      throw new HttpError(409, "Für diesen Dienst gibt es bereits eine offene Tauschanfrage.");
    const row = await insertSwap(
      context,
      shiftSwapSchema.parse({
        requesterId: context.user.id,
        partnerId: data.partnerId,
        serviceId: service.id,
        serviceVersion: service.version,
        serviceStart: occurrence.start.toISOString(),
        serviceEnd: occurrence.end.toISOString(),
        serviceTitle: calendarPresentation(serialize(service), productions, categories).title,
        counterServiceId: counter?.id || "",
        counterServiceVersion: counter?.version || 0,
        counterServiceStart: counterOccurrence?.start.toISOString() || "",
        counterServiceEnd: counterOccurrence?.end.toISOString() || "",
        counterServiceTitle: counter
          ? calendarPresentation(serialize(counter), productions, categories).title
          : "",
        note: data.note,
        requestedAt: new Date().toISOString(),
      }),
      tx,
    );
    await notifySwap(context, row, tx);
    return serialize(row);
  });
  invalidateWorkspace(context.departmentId);
  scheduleEvents();
  return result;
}

async function validateSwapServices(context: Context, swap: ShiftSwapData, tx: Transaction) {
  const services = await lockedServices(context, [swap.serviceId, swap.counterServiceId], tx);
  const people = await activePeople(
    context,
    [
      swap.requesterId,
      swap.partnerId,
      ...[...services.values()].flatMap((service) => listValue(service.data.participantIds)),
    ],
    tx,
  );
  const calendar = (await planning(context, tx)).map(serialize);
  const categories = calendar.filter((row) => row.kind === "calendarCategories");
  const moves: SwapTransfer[] = [];
  const refs = [
    {
      id: swap.serviceId,
      version: swap.serviceVersion,
      start: swap.serviceStart,
      end: swap.serviceEnd,
      from: swap.requesterId,
      to: swap.partnerId,
    },
    ...(swap.counterServiceId
      ? [
          {
            id: swap.counterServiceId,
            version: swap.counterServiceVersion,
            start: swap.counterServiceStart,
            end: swap.counterServiceEnd,
            from: swap.partnerId,
            to: swap.requesterId,
          },
        ]
      : []),
  ];
  for (const ref of refs) {
    const row = services.get(ref.id)!;
    if (row.version !== ref.version)
      throw new HttpError(
        409,
        "Ein Dienst wurde seit der Anfrage geändert. Bitte zieht die Anfrage zurück und stellt sie neu.",
      );
    await assertServiceAccess(
      context,
      row,
      peopleForService(people, row, swap.requesterId, swap.partnerId),
      tx,
    );
    const event = serialize(row);
    const occurrence = selectedSwapOccurrence(event, ref.start, ref.from, categories);
    if (occurrence.end.toISOString() !== ref.end)
      throw new HttpError(
        409,
        "Die Dienstzeiten haben sich geändert. Bitte stellt eine neue Anfrage.",
      );
    replacementParticipants(event, ref.from, ref.to);
    moves.push({ event, ...occurrence, outgoingId: ref.from, incomingId: ref.to });
  }
  return { services, calendar, categories, moves };
}

async function approveCalendarSwap(context: Context, swap: ShiftSwapData, tx: Transaction) {
  const { services, calendar, categories, moves } = await validateSwapServices(context, swap, tx);
  if (findSwapConflict(moves, calendar, categories))
    throw new HttpError(
      409,
      "Für eine übernehmende Person besteht ein Zeitkonflikt mit einem Dienst, Termin oder einer Abwesenheit. Bitte prüfe den Kalender.",
    );
  const resultIds: string[] = [];
  for (const move of moves) {
    const before = services.get(move.event.id)!;
    const participants = replacementParticipants(move.event, move.outgoingId, move.incomingId);
    if (before.data.recurrence && before.data.recurrence !== "none") {
      await updateRow(
        context,
        before,
        {
          ...before.data,
          exceptions: [
            ...new Set([...listValue(before.data.exceptions), localDay(move.start.toISOString())]),
          ],
        },
        tx,
      );
      const [replacement] = await tx
        .insert(records)
        .values({
          id: crypto.randomUUID(),
          kind: "events",
          organizationId: context.organizationId,
          departmentId: context.departmentId,
          createdBy: context.user.id,
          productionId: textValue(before.data.productionId) || null,
          startAt: move.start,
          endAt: move.end,
          data: {
            ...before.data,
            start: move.start.toISOString(),
            end: move.end.toISOString(),
            participantIds: participants,
            recurrence: "none",
            until: "",
            exceptions: [],
          },
        })
        .returning();
      await auditChange(tx, context, "events.created", replacement.id);
      resultIds.push(replacement.id);
    } else {
      const updated = await updateRow(
        context,
        before,
        { ...before.data, participantIds: participants },
        tx,
      );
      resultIds.push(updated.id);
    }
  }
  return resultIds;
}

export async function decideShiftSwap(context: Context, id: string, input: unknown) {
  const data = shiftSwapActionSchema.parse(input);
  const result = await db.transaction(async (tx) => {
    await acquireWorkflowLock(context, "shiftSwaps", tx);
    const before = await findRecord(context, id, "shiftSwaps", tx, true);
    if (!canReadShiftSwap(context.user, before.data))
      throw new HttpError(403, "Diese Tauschanfrage ist privat.");
    if (before.version !== data.version)
      throw new HttpError(409, "Die Anfrage wurde inzwischen geändert. Bitte lade sie neu.");
    const stored = shiftSwapSchema.parse(before.data);
    const status = shiftSwapTransition(context.user, stored, data.action);
    const resultEventIds =
      data.action === "approve"
        ? await approveCalendarSwap(context, stored, tx)
        : stored.resultEventIds;
    if (data.action === "accept") {
      // Consent refers to the same stored occurrence and active staff, not an edited service.
      await validateSwapServices(context, stored, tx);
    }
    const now = new Date().toISOString();
    const after = await updateRow(
      context,
      before,
      shiftSwapSchema.parse({
        ...stored,
        status,
        resultEventIds,
        ...(["accept", "decline"].includes(data.action) ? { partnerDecidedAt: now } : {}),
        ...(["approve", "reject"].includes(data.action)
          ? { adminDecidedAt: now, decidedBy: context.user.id }
          : {}),
      }),
      tx,
    );
    await notifySwap(context, after, tx);
    return serialize(after);
  });
  invalidateWorkspace(context.departmentId);
  scheduleEvents();
  return result;
}
