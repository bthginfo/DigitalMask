import { cookies, headers } from "next/headers";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth, sessionExpiresIn, sessionUpdateAge } from "@/platform/auth";
import { db } from "@/platform/db";
import { memberships, organizations, departments, profilePreferences } from "@/platform/db/schema";
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
      .select({
        membership: memberships,
        organization: organizations,
        department: departments,
        preferences: profilePreferences,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .innerJoin(departments, eq(memberships.departmentId, departments.id))
      .leftJoin(profilePreferences, eq(memberships.userId, profilePreferences.userId))
      .where(eq(memberships.userId, userId))
      .limit(1);
  return fresh
    ? get()
    : unstable_cache(get, ["membership-profile-v2", userId], {
        revalidate: 60,
        tags: [`member:${userId}`],
      })();
}
/** Better Auth extends a session once `updateAge` has passed since the last extension. */
export function sessionNeedsRefresh(session: { expiresAt: string | Date }, now = Date.now()) {
  const expiresAt = new Date(session.expiresAt).getTime();
  return (
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    expiresAt - sessionExpiresIn * 1000 + sessionUpdateAge * 1000 <= now
  );
}
/**
 * The auth handler is not mounted, so cookies that auth.api sets would be lost. A refreshed
 * session must reach the browser, otherwise the cookie still expires a week after login although
 * the database session was extended.
 */
export async function writeRefreshedSessionCookies(responseHeaders: Headers) {
  const setCookie = responseHeaders.get("set-cookie");
  if (!setCookie) return false;
  const parsed = parseSetCookieHeader(setCookie);
  if (![...parsed.keys()].some((name) => name.endsWith("session_token"))) return false;
  try {
    const store = await cookies();
    for (const [name, value] of parsed) store.set(name, value.value, toCookieOptions(value));
    return true;
  } catch {
    // Read-only outside route handlers and server actions; the next write refreshes again.
    return false;
  }
}
/** Uncached read that may extend the session and then writes the renewed cookie back. */
async function refreshingSession(requestHeaders: Headers) {
  const { headers: responseHeaders, response } = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  await writeRefreshedSessionCookies(responseHeaders);
  return response;
}
export async function requireContext(fresh = false): Promise<Context> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") || "";
  let result =
    fresh || !cookie
      ? await refreshingSession(requestHeaders)
      : await unstable_cache(
          // Never extend a session inside the cache: its cookie could not be written back.
          () => auth.api.getSession({ headers: requestHeaders, query: { disableRefresh: true } }),
          ["session-context", createHash("sha256").update(cookie).digest("hex")],
          { revalidate: 60 },
        )();
  // About once a day per active session, also for read-only use of the app.
  if (result && !fresh && cookie && sessionNeedsRefresh(result.session))
    result = await refreshingSession(requestHeaders);
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
      preferences: {
        accentPalette: row.preferences?.accentPalette || "green",
        onboardingVersion: row.preferences?.onboardingVersion || 0,
        ...(row.preferences?.workingTime ? { workingTime: row.preferences.workingTime } : {}),
      },
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
