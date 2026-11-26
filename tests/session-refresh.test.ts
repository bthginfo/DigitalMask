import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  set: vi.fn(),
  headers: new Headers({ cookie: "better-auth.session_token=token.signature" }),
  cookies: vi.fn(),
  execute: vi.fn(),
  membership: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => mocks.headers,
  cookies: mocks.cookies,
}));
vi.mock("next/cache", () => ({ unstable_cache: (read: () => unknown) => read }));
vi.mock("@/platform/auth", () => ({
  auth: { api: { getSession: mocks.getSession, signInUsername: mocks.signIn } },
  sessionExpiresIn: 7 * 86_400,
  sessionUpdateAge: 86_400,
}));
vi.mock("@/platform/db", () => ({
  db: {
    execute: mocks.execute,
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => mocks.membership(),
      };
      return chain;
    },
  },
}));
import {
  requireContext,
  sessionNeedsRefresh,
  writeRefreshedSessionCookies,
} from "@/platform/context";
import { POST as login } from "@/app/api/login/route";

const day = 86_400_000;
const now = Date.parse("2026-11-26T12:00:00Z");
const session = (expiresIn: number) => ({
  session: { expiresAt: new Date(now + expiresIn).toISOString() },
  user: { id: "member", name: "Mitglied", username: "member" },
});
const refreshedCookies =
  "better-auth.session_token=token.signature; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax, better-auth.session_data=payload; Max-Age=60; Path=/; HttpOnly; SameSite=Lax";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now });
  mocks.cookies.mockResolvedValue({ set: mocks.set });
  mocks.membership.mockResolvedValue([
    {
      membership: {
        role: "user",
        status: "active",
        organizationId: "theatre",
        departmentId: "makeup",
      },
      organization: { name: "Theater" },
      department: { name: "Maske" },
      preferences: null,
    },
  ]);
});

describe("session refresh without a mounted auth handler", () => {
  it("knows when Better Auth extends a session", () => {
    expect(sessionNeedsRefresh(session(7 * day).session, now)).toBe(false);
    expect(sessionNeedsRefresh(session(6 * day + 1).session, now)).toBe(false);
    expect(sessionNeedsRefresh(session(6 * day).session, now)).toBe(true);
    expect(sessionNeedsRefresh(session(-1).session, now)).toBe(false);
  });

  it("writes the renewed session cookie back, but no plain cookie-cache refresh", async () => {
    expect(
      await writeRefreshedSessionCookies(new Headers({ "set-cookie": refreshedCookies })),
    ).toBe(true);
    expect(mocks.set).toHaveBeenCalledWith(
      "better-auth.session_token",
      "token.signature",
      expect.objectContaining({ maxAge: 604800, httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(mocks.set).toHaveBeenCalledTimes(2);
    mocks.set.mockClear();
    expect(
      await writeRefreshedSessionCookies(
        new Headers({ "set-cookie": "better-auth.session_data=payload; Max-Age=60; Path=/" }),
      ),
    ).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.cookies.mockRejectedValueOnce(new Error("read-only"));
    expect(
      await writeRefreshedSessionCookies(new Headers({ "set-cookie": refreshedCookies })),
    ).toBe(false);
  });

  it("reads cached sessions without extending them and refreshes due ones once, uncached", async () => {
    mocks.getSession.mockResolvedValueOnce(session(5 * day)).mockResolvedValueOnce({
      headers: new Headers({ "set-cookie": refreshedCookies }),
      response: session(7 * day),
    });
    const context = await requireContext();
    expect(context.user.id).toBe("member");
    expect(mocks.getSession.mock.calls[0][0].query).toEqual({ disableRefresh: true });
    expect(mocks.getSession.mock.calls[1][0]).toMatchObject({
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    expect(mocks.set).toHaveBeenCalledWith(
      "better-auth.session_token",
      "token.signature",
      expect.anything(),
    );
  });

  it("does not refresh a recent session and lets writes read it fresh", async () => {
    mocks.getSession.mockResolvedValueOnce(session(7 * day - 60_000));
    await requireContext();
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    mocks.getSession.mockResolvedValueOnce({ headers: new Headers(), response: session(7 * day) });
    await requireContext(true);
    expect(mocks.getSession.mock.calls[1][0]).toMatchObject({ returnHeaders: true });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("login throttling", () => {
  const request = (username: string, ip = "198.51.100.7") =>
    new Request("https://digitalmask.example/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip, origin: "https://digitalmask.example" },
      body: JSON.stringify({ username, password: "wrong-password" }),
    });
  it("limits attempts per username across addresses and resets after a success", async () => {
    const counts = new Map<string, number>();
    mocks.execute.mockImplementation(async (query: { queryChunks: unknown[] }) => {
      const text = JSON.stringify(query);
      if (text.includes("delete from auth_rate_limit")) {
        counts.clear();
        return [];
      }
      const key = JSON.stringify(query.queryChunks[1]);
      counts.set(key, (counts.get(key) || 0) + 1);
      return [{ count: counts.get(key) }];
    });
    mocks.signIn.mockResolvedValue(
      Response.json({ code: "INVALID_USERNAME_OR_PASSWORD" }, { status: 401 }),
    );
    for (let attempt = 0; attempt < 10; attempt++)
      expect((await login(request("Lena", `203.0.113.${attempt}`))).status).toBe(401);
    const blocked = await login(request("lena", "203.0.113.200"));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toContain("diesen Benutzernamen");
    expect(mocks.signIn).toHaveBeenCalledTimes(10);
    mocks.signIn.mockResolvedValueOnce(Response.json({ ok: true }));
    counts.clear();
    expect((await login(request("lena"))).status).toBe(200);
    expect(JSON.stringify(mocks.execute.mock.calls.at(-1))).toContain(
      "delete from auth_rate_limit",
    );
  });
});
