import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/platform/db";
import { googleCalendarConnections } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { requireContext } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { scheduleEvents } from "@/platform/events";
import { googleCalendarConfig, googleCalendarScopes } from "./config";
import { openGoogleSecret, sealGoogleSecret } from "./crypto";
import { exchangeGoogleCode, getGoogleIdentity, GoogleCalendarError } from "./provider";
import {
  findGoogleConnection,
  googleConnectionTokens,
  googleTokenPurpose,
  withGoogleConnection,
} from "./repository";
import { queueGoogleCalendarSync } from "./queue";

const cookieName = "digitalmask-google-calendar-oauth";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/integrations/google-calendar",
  maxAge: 600,
};
type OAuthState = {
  state: string;
  verifier: string;
  expiresAt: number;
  returnTo: "calendar" | "settings";
};
const purpose = (context: Context) =>
  `google-calendar-oauth:${context.departmentId}:${context.user.id}`;

export async function startGoogleCalendar(context: Context, returnTo: "calendar" | "settings") {
  const config = googleCalendarConfig();
  const current = await findGoogleConnection(context);
  const state: OAuthState = {
    state: randomBytes(32).toString("hex"),
    verifier: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + 600000,
    returnTo,
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: googleCalendarScopes.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    state: state.state,
    code_challenge: createHash("sha256").update(state.verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(current ? { login_hint: current.email } : {}),
  }).toString();
  const response = NextResponse.json(
    { url: url.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(cookieName, sealGoogleSecret(state, purpose(context)), cookieOptions);
  return response;
}

export async function finishGoogleCalendar(request: Request) {
  const config = googleCalendarConfig();
  let returnTo: OAuthState["returnTo"] = "settings";
  let outcome = "failed";
  try {
    const context = await requireContext(true);
    const encoded = (await cookies()).get(cookieName)?.value;
    if (!encoded) throw new HttpError(400, "expired");
    let state: OAuthState;
    try {
      state = openGoogleSecret<OAuthState>(encoded, purpose(context));
    } catch {
      throw new HttpError(400, "expired");
    }
    const url = new URL(request.url);
    const actual = url.searchParams.get("state") || "";
    if (
      !/^[a-f\d]{64}$/.test(actual) ||
      typeof state.state !== "string" ||
      actual.length !== state.state.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(state.state)) ||
      state.expiresAt < Date.now()
    )
      throw new HttpError(400, "expired");
    returnTo = state.returnTo === "calendar" ? "calendar" : "settings";
    if (url.searchParams.has("error")) throw new HttpError(400, "cancelled");
    const code = url.searchParams.get("code") || "";
    if (!code || code.length > 4096) throw new HttpError(400, "expired");
    const tokens = await exchangeGoogleCode(code, state.verifier);
    const identity = await getGoogleIdentity(tokens.accessToken);
    const existing = await findGoogleConnection(context);
    if (existing && existing.googleSubject !== identity.subject)
      throw new HttpError(409, "account");
    if (existing) {
      await withGoogleConnection(
        existing.id,
        async (row) => {
          if (row.googleSubject !== identity.subject) throw new HttpError(409, "account");
          const refreshToken = tokens.refreshToken || googleConnectionTokens(row).refreshToken;
          if (!refreshToken) throw new GoogleCalendarError("reconnect");
          await db.transaction(async (tx) => {
            await tx
              .update(googleCalendarConnections)
              .set({
                email: identity.email,
                credentials: sealGoogleSecret({ ...tokens, refreshToken }, googleTokenPurpose(row)),
                status: row.calendarId ? "active" : "connected",
                lastError: null,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(googleCalendarConnections.id, row.id),
                  eq(googleCalendarConnections.userId, context.user.id),
                  eq(googleCalendarConnections.departmentId, context.departmentId),
                ),
              );
            if (row.calendarId) await queueGoogleCalendarSync(tx, context);
          });
        },
        context,
      );
      if (existing.calendarId) scheduleEvents();
    } else {
      if (!tokens.refreshToken) throw new GoogleCalendarError("reconnect");
      const row = {
        id: crypto.randomUUID(),
        userId: context.user.id,
        departmentId: context.departmentId,
      };
      await db
        .insert(googleCalendarConnections)
        .values({
          ...row,
          googleSubject: identity.subject,
          email: identity.email,
          credentials: sealGoogleSecret(tokens, googleTokenPurpose(row)),
          selection: { mode: "mine", memberIds: [context.user.id] },
        });
    }
    outcome = "connected";
  } catch (error) {
    if (error instanceof HttpError && ["expired", "cancelled", "account"].includes(error.message))
      outcome = error.message;
    else if (error instanceof GoogleCalendarError && error.code === "permission")
      outcome = "permissions";
    // Do not log authorization codes, provider responses, state or credentials.
  }
  const target = new URL("/", config.origin);
  target.search = new URLSearchParams({ module: returnTo, googleCalendar: outcome }).toString();
  const response = NextResponse.redirect(target, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
