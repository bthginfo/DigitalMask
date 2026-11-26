import { NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { HttpError, readJson, route } from "@/platform/http";
import { authFeedback, loginInput } from "@/shared/auth-feedback";
import { resetThrottle, throttle, throttleSubject } from "@/platform/auth/throttle";
const loginAttemptsPerAccount = 10;
const loginAccountWindowMs = 15 * 60_000;
export async function POST(request: Request) {
  return route(async () => {
    const input = loginInput.safeParse(await readJson(request));
    if (!input.success) throw new HttpError(400, input.error.issues[0].message);
    const body = { ...input.data, username: input.data.username.toLowerCase() };
    await throttle(request, "login", 10);
    // Guessing one account's password from many addresses is limited too.
    await throttleSubject(
      "login-user",
      body.username,
      loginAttemptsPerAccount,
      loginAccountWindowMs,
      "Zu viele Anmeldeversuche für diesen Benutzernamen. Bitte warte einige Minuten.",
    );
    const response = await auth.api.signInUsername({
      body,
      headers: request.headers,
      asResponse: true,
    });
    if (response.ok) {
      await resetThrottle("login-user", body.username);
      return response;
    }
    const failure = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: authFeedback(failure.code, response.status) },
      { status: response.status },
    );
  });
}
