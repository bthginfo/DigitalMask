import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/platform/auth";
import { db } from "@/platform/db";
import { memberships, organizations, departments } from "@/platform/db/schema";
import { HttpError } from "@/platform/http";
import type { Member } from "@/shared/contracts";
export interface Context {
  user: Member;
  organizationId: string;
  departmentId: string;
  organizationName: string;
  departmentName: string;
}
export const scopeTag = (departmentId: string) => `workspace:${departmentId}`;
async function membershipFor(userId: string, fresh = false) {
  const get = () =>
    db
      .select({ membership: memberships, organization: organizations, department: departments })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .innerJoin(departments, eq(memberships.departmentId, departments.id))
      .where(eq(memberships.userId, userId))
      .limit(1);
  return fresh
    ? get()
    : unstable_cache(get, ["membership", userId], { revalidate: 60, tags: [`member:${userId}`] })();
}
export async function requireContext(fresh = false): Promise<Context> {
  const requestHeaders = await headers();
  const readSession = () =>
    auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: fresh } });
  const cookie = requestHeaders.get("cookie") || "";
  const result =
    fresh || !cookie
      ? await readSession()
      : await unstable_cache(
          readSession,
          ["session-context", createHash("sha256").update(cookie).digest("hex")],
          { revalidate: 60 },
        )();
  if (!result) throw new HttpError(401, "Bitte melde dich an.");
  const [row] = await membershipFor(result.user.id, fresh);
  if (!row) throw new HttpError(403, "Dein Zugang wurde noch keiner Abteilung zugeordnet.");
  if (row.membership.status !== "active")
    throw new HttpError(
      403,
      row.membership.status === "pending"
        ? "Dein Zugang wartet auf Freigabe."
        : "Dein Zugang ist deaktiviert.",
      { pending: row.membership.status === "pending" },
    );
  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      username: result.user.username || "",
      role: row.membership.role,
      status: row.membership.status,
    },
    organizationId: row.membership.organizationId,
    departmentId: row.membership.departmentId,
    organizationName: row.organization.name,
    departmentName: row.department.name,
  };
}
export function requireAdmin(context: Context) {
  if (context.user.role === "user")
    throw new HttpError(403, "Diese Aktion ist Admins vorbehalten.");
}
export function requireSuperadmin(context: Context) {
  if (context.user.role !== "superadmin")
    throw new HttpError(403, "Diese Aktion ist dem Superadmin vorbehalten.");
}
