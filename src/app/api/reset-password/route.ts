import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/platform/db";
import { user, account, session, verification } from "@/platform/db/schema";
import { readJson, route, HttpError } from "@/platform/http";
import { throttle } from "@/platform/auth/throttle";
export async function POST(request: Request) {
  return route(async () => {
    const body = z
      .object({
        username: z.string().min(3).max(32),
        code: z.string().min(1).max(100),
        password: z.string().min(10).max(128),
      })
      .parse(await readJson(request));
    await throttle(request, "reset-password", 5);
    const password = await hashPassword(body.password);
    await db.transaction(async (tx) => {
      const [person] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.username, body.username.toLowerCase()));
      if (!person) throw new HttpError(400, "Ungültiger oder abgelaufener Code.");
      const [token] = await tx
        .select()
        .from(verification)
        .where(eq(verification.identifier, `digitalmask-reset:${person.id}`))
        .for("update");
      if (
        !token ||
        token.expiresAt < new Date() ||
        token.value !== createHash("sha256").update(body.code).digest("hex")
      )
        throw new HttpError(400, "Ungültiger oder abgelaufener Code.");
      await tx
        .update(account)
        .set({ password, updatedAt: new Date() })
        .where(and(eq(account.userId, person.id), eq(account.providerId, "credential")));
      await tx.delete(verification).where(eq(verification.id, token.id));
      await tx.delete(session).where(eq(session.userId, person.id));
    });
    return NextResponse.json({ ok: true });
  });
}
