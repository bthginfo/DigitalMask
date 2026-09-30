import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/platform/db";
import { timers, attendanceTimers } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { assertProject } from "@/modules/records/repository";
import { saveRecord } from "@/modules/records/service";
import { validateCategoryReferences } from "@/modules/categories/service";
import { invalidateWorkspace } from "@/modules/records/workspace";
import { localDay, durationSeconds } from "./rules";
import type { RecordData } from "@/shared/contracts";
export async function timerAction(
  context: Context,
  action: string,
  data: RecordData,
  kind: "time" | "attendance" = "time",
) {
  const timerTable = kind === "attendance" ? attendanceTimers : timers;
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${kind + ":timer:" + context.user.id}))`,
    );
    const [timer] = await tx
      .select()
      .from(timerTable)
      .where(eq(timerTable.userId, context.user.id))
      .for("update");
    const now = new Date().toISOString();
    if (action === "timer-start") {
      if (timer) throw new HttpError(409, "Es läuft bereits ein Timer.");
      data = z
        .object({
          title: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .default(kind === "attendance" ? "Anwesenheit" : "Arbeitszeit"),
          productionId: z.string().max(100).default(""),
          taskId: z.string().max(100).default(""),
          category: z.string().trim().min(1).max(80).default("production"),
        })
        .parse(data);
      if (kind === "attendance") data = { title: data.title };
      else {
        await assertProject(context, data.productionId, tx);
        await validateCategoryReferences(context, "time", data, tx);
      }
      const [created] = await tx
        .insert(timerTable)
        .values({
          id: crypto.randomUUID(),
          userId: context.user.id,
          departmentId: context.departmentId,
          data: {
            title: data.title,
            productionId: data.productionId || "",
            taskId: data.taskId || "",
            category: data.category || "production",
            startedAt: now,
            pausedAt: null,
            pauseSeconds: 0,
          },
        })
        .returning();
      return created;
    }
    if (!timer || timer.departmentId !== context.departmentId)
      throw new HttpError(404, "Es läuft kein Timer.");
    if (action === "timer-discard") {
      if (timer.data.stopping)
        throw new HttpError(409, "Bitte schließe zuerst die laufende Speicherung ab.");
      await tx.delete(timerTable).where(eq(timerTable.id, timer.id));
      return { discarded: true };
    }
    if (action === "timer-pause" || action === "timer-resume") {
      if (timer.data.stopping)
        throw new HttpError(409, "Der Timer wird gerade als Zeitbuchung gespeichert.");
      const paused = timer.data.pausedAt;
      if (action === "timer-pause" && paused)
        throw new HttpError(409, "Der Timer ist bereits pausiert.");
      if (action === "timer-resume" && !paused)
        throw new HttpError(409, "Der Timer läuft bereits.");
      const updated = {
        ...timer.data,
        pausedAt: action === "timer-pause" ? now : null,
        pauseSeconds:
          Number(timer.data.pauseSeconds || 0) +
          (action === "timer-resume"
            ? Math.floor((Date.now() - new Date(String(paused)).getTime()) / 1000)
            : 0),
      };
      const [row] = await tx
        .update(timerTable)
        .set({ data: updated })
        .where(eq(timerTable.id, timer.id))
        .returning();
      return row;
    }
    if (action === "timer-stop") {
      const end = String(timer.data.stoppedAt || timer.data.pausedAt || now);
      let duration: number;
      try {
        duration = durationSeconds(
          String(timer.data.startedAt),
          end,
          Number(timer.data.pauseSeconds || 0),
        );
      } catch {
        throw new HttpError(
          400,
          "Bitte buche diese Zeit manuell; der Timer ist zu kurz oder ungewöhnlich lang.",
        );
      }
      // Reserve the conversion in this transaction. Retrying stop reuses the same immutable booking key.
      const payload = {
        ...timer.data,
        start: String(timer.data.startedAt),
        end,
        durationSeconds: duration,
        pauseSeconds: Number(timer.data.pauseSeconds || 0),
        userId: context.user.id,
        date: localDay(String(timer.data.startedAt)),
        idempotencyKey:
          kind === "attendance" ? `attendance:timer:${timer.id}` : `timer:${timer.id}`,
      };
      await tx
        .update(timerTable)
        .set({ data: { ...timer.data, stopping: true, stoppedAt: end } })
        .where(eq(timerTable.id, timer.id));
      return { timerId: timer.id, payload };
    }
    throw new HttpError(400, "Unbekannte Timeraktion.");
  });
  if ("payload" in result && result.payload && result.timerId) {
    const booking = await saveRecord(context, kind, result.payload);
    await db
      .delete(timerTable)
      .where(and(eq(timerTable.id, result.timerId), eq(timerTable.userId, context.user.id)));
    invalidateWorkspace(context.departmentId);
    return booking;
  }
  invalidateWorkspace(context.departmentId);
  return result;
}
