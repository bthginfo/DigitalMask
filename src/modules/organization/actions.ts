import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/platform/db";
import {
  memberships,
  user,
  session,
  verification,
  records,
  calendarTokens,
} from "@/platform/db/schema";
import { requireAdmin, requireSuperadmin, type Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { auditChange } from "@/platform/events";
import { findRecord, serialize } from "@/modules/records/repository";
import { invalidateWorkspace, invalidateTeam } from "@/modules/records/workspace";
import { assertRead } from "@/modules/records/service";
import type { RecordData } from "@/shared/contracts";
import { linkApprovedMakeupContacts } from "@/modules/people/link-team-member";
export async function organizationAction(
  context: Context,
  action: string,
  id: string | undefined,
  data: RecordData,
) {
  if (action === "calendar-token") {
    const token = randomBytes(32).toString("base64url");
    await db.transaction(async (tx) => {
      await tx
        .delete(calendarTokens)
        .where(
          and(
            eq(calendarTokens.userId, context.user.id),
            eq(calendarTokens.departmentId, context.departmentId),
          ),
        );
      if (!data.revoke)
        await tx.insert(calendarTokens).values({
          id: crypto.randomUUID(),
          tokenHash: createHash("sha256").update(token).digest("hex"),
          userId: context.user.id,
          departmentId: context.departmentId,
        });
    });
    return {
      url: data.revoke
        ? null
        : `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/${token}`,
    };
  }
  if (action === "notification-read") {
    if (!id) throw new HttpError(400, "Eintrag fehlt.");
    const row = await findRecord(context, id, "notifications");
    if (row.data.userId !== context.user.id) throw new HttpError(403, "Keine Berechtigung.");
    await assertRead(context, row);
    const [updated] = await db
      .update(records)
      .set({ data: { ...row.data, read: true }, version: row.version + 1 })
      .where(eq(records.id, id))
      .returning();
    invalidateWorkspace(context.departmentId);
    return serialize(updated);
  }
  requireAdmin(context);
  if (!id) throw new HttpError(400, "Bitte wähle eine Person.");
  const [member] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, id), eq(memberships.departmentId, context.departmentId)))
    .limit(1);
  if (!member) throw new HttpError(404, "Die Person wurde nicht gefunden.");
  if (action === "member-update") {
    if (data.role !== undefined) {
      requireSuperadmin(context);
      if (!["user", "admin", "superadmin"].includes(String(data.role)))
        throw new HttpError(400, "Ungültige Rolle.");
    }
    if (
      data.status !== undefined &&
      !["active", "pending", "disabled"].includes(String(data.status))
    )
      throw new HttpError(400, "Ungültiger Status.");
    if (
      member.role === "superadmin" &&
      ((data.role && data.role !== "superadmin") || (data.status && data.status !== "active"))
    )
      throw new HttpError(409, "Superadmin-Zugänge werden nicht über diesen Dialog deaktiviert.");
    if (member.role === "admin" && context.user.role !== "superadmin")
      throw new HttpError(403, "Admins werden durch den Superadmin verwaltet.");
    const linked = await db.transaction(async (tx) => {
      await tx
        .update(memberships)
        .set({
          role: (data.role || member.role) as typeof member.role,
          status: (data.status || member.status) as typeof member.status,
        })
        .where(eq(memberships.id, member.id));
      await tx.delete(session).where(eq(session.userId, id));
      await auditChange(tx, context, "member.updated", id);
      return data.status === "active"
        ? linkApprovedMakeupContacts(context, id, tx)
        : { contacts: 0, productions: 0 };
    });
    revalidateTag(`member:${id}`, { expire: 0 });
    invalidateTeam(context.departmentId);
    invalidateWorkspace(context.departmentId);
    return { ok: true, linked };
  }
  if (action === "password-reset") {
    if (member.role === "superadmin" && context.user.role !== "superadmin")
      throw new HttpError(403, "Keine Berechtigung.");
    const code = randomBytes(18).toString("base64url");
    await db.transaction(async (tx) => {
      await tx.delete(verification).where(eq(verification.identifier, `digitalmask-reset:${id}`));
      await tx.insert(verification).values({
        id: crypto.randomUUID(),
        identifier: `digitalmask-reset:${id}`,
        value: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + 15 * 60000),
      });
      await tx.delete(session).where(eq(session.userId, id));
      await auditChange(tx, context, "password.reset-issued", id);
    });
    return {
      code,
      username: (await db.select({ username: user.username }).from(user).where(eq(user.id, id)))[0]
        ?.username,
      expiresInMinutes: 15,
    };
  }
  throw new HttpError(400, "Unbekannte Aktion.");
}
