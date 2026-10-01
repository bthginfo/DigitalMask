import { NextResponse } from "next/server";
import { auth } from "@/platform/auth";
import { HttpError, readJson, route } from "@/platform/http";
import { authFeedback, loginInput } from "@/shared/auth-feedback";
import { throttle } from "@/platform/auth/throttle";
export async function POST(request: Request) {
  return route(async () => {
    const input = loginInput.safeParse(await readJson(request));
    if (!input.success) throw new HttpError(400, input.error.issues[0].message);
    const body = { ...input.data, username: input.data.username.toLowerCase() };
    await throttle(request, "login", 10);
    const response = await auth.api.signInUsername({
      body,
      headers: request.headers,
      asResponse: true,
    });
    if (response.ok) return response;
    const failure = await response.json().catch(() => ({}));
    return NextResponse.json(
      { error: authFeedback(failure.code, response.status) },
      { status: response.status },
    );
  });
}
