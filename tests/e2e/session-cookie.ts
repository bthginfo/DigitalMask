/**
 * src/proxy.ts sends requests for "/" without a Better Auth session cookie to /login. Specs that
 * mock every /api call in the browser only need the cookie to be present, never valid.
 */
export const mockSessionCookieName = "better-auth.session_token";

export function mockSessionCookie(baseURL = process.env.E2E_BASE_URL || "http://localhost:3000") {
  return { name: mockSessionCookieName, value: "e2e-mocked-session", url: baseURL };
}

/** Same cookie for a Playwright storageState (used by the default page/context fixtures). */
export function mockSessionState(baseURL = process.env.E2E_BASE_URL || "http://localhost:3000") {
  return {
    cookies: [
      {
        name: mockSessionCookieName,
        value: "e2e-mocked-session",
        domain: new URL(baseURL).hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
