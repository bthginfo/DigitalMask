import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import {
  calendarTokens,
  memberships,
  organizations,
  departments,
  user,
} from "@/platform/db/schema";
import { getWorkspace } from "@/modules/records/workspace";
import { buildExport } from "@/modules/exports";
import { route, HttpError } from "@/platform/http";
import { listValue } from "@/shared/contracts";
import type { Context } from "@/platform/context";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return route(async () => {
    const token = (await params).token;
    if (token.length > 100) throw new HttpError(404, "Kalender nicht gefunden.");
    const [row] = await db
      .select({
        token: calendarTokens,
        member: memberships,
        organization: organizations,
        department: departments,
        user,
      })
      .from(calendarTokens)
      .innerJoin(
        memberships,
        and(
          eq(calendarTokens.userId, memberships.userId),
          eq(calendarTokens.departmentId, memberships.departmentId),
        ),
      )
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .innerJoin(departments, eq(memberships.departmentId, departments.id))
      .innerJoin(user, eq(calendarTokens.userId, user.id))
      .where(eq(calendarTokens.tokenHash, createHash("sha256").update(token).digest("hex")))
      .limit(1);
    if (!row || row.member.status !== "active")
      throw new HttpError(404, "Kalender nicht gefunden.");
    const context: Context = {
      user: {
        id: row.user.id,
        name: row.user.name,
        username: row.user.username || "",
        role: row.member.role,
        status: row.member.status,
      },
      organizationId: row.organization.id,
      departmentId: row.department.id,
      organizationName: row.organization.name,
      departmentName: row.department.name,
    };
    const workspace = await getWorkspace(context);
    const result = await buildExport({
      kind: "events",
      format: "ics",
      records: workspace.records.events.filter((e) =>
        listValue(e.data.participantIds).includes(row.user.id),
      ),
      members: workspace.members,
      organization: row.organization.name,
      department: row.department.name,
    });
    return new Response(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}
