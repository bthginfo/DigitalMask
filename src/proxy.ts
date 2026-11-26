import { NextResponse, type NextRequest } from "next/server";

/**
 * Better Auth session cookie names. src/platform/auth/index.ts sets no cookiePrefix, so the
 * default "better-auth" prefix applies; secure deployments add the "__Secure-" prefix
 * (see also the session binding in src/platform/realtime/ticket.ts).
 */
const sessionCookies = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/**
 * Send visitors without any session cookie straight to the login page instead of loading the
 * workspace shell first. This is a presence check only; the API still verifies every session.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  if (sessionCookies.some((name) => request.cookies.get(name)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  // Deep links (notifications, shared app links) continue after signing in.
  const query = new URLSearchParams(request.nextUrl.searchParams);
  query.delete("_rsc");
  if (query.size) login.searchParams.set("next", `/?${query}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Only the workspace page: /login, /register, /api, static files, sw.js, the manifest,
  // icons and /google-calendar never reach the proxy.
  matcher: "/",
};
