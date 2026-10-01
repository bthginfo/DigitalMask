import { APIError } from "better-auth/api";
import { authFeedback, registrationInput } from "@/shared/auth-feedback";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/platform/auth";
import { db } from "@/platform/db";
import { departments, memberships } from "@/platform/db/schema";
import { readJson, route, HttpError } from "@/platform/http";
import { throttle } from "@/platform/auth/throttle";
import { invalidateWorkspace, invalidateTeam } from "@/modules/records/workspace";
export async function POST(request: Request) {
  return route(async () => {
    const input = registrationInput.safeParse(await readJson(request));
    if (!input.success) throw new HttpError(400, input.error.issues[0].message);
    const body = input.data;
    await throttle(request, "register", 5);
    const [department] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, "maske"))
      .limit(1);
    if (!department) throw new HttpError(503, "Die Einrichtung wird gerade abgeschlossen.");
    const response = await auth.api
      .signUpEmail({
        body: {
          ...body,
          username: body.username.toLowerCase(),
          email: `${crypto.randomUUID()}@users.digitalmask.invalid`,
        },
        headers: request.headers,
      })
      .catch((error: unknown) => {
        if (error instanceof APIError)
          throw new HttpError(
            error.statusCode || 400,
            authFeedback(error.body?.code, error.statusCode || 400, true),
          );
        throw error;
      });
    await db.insert(memberships).values({
      id: crypto.randomUUID(),
      userId: response.user.id,
      organizationId: department.organizationId,
      departmentId: department.id,
      role: "user",
      status: "pending",
    });
    invalidateTeam(department.id);
    invalidateWorkspace(department.id);
    return NextResponse.json({ pending: true }, { status: 201 });
  });
}
