import { z } from "zod";
import { requireContext } from "@/platform/context";
import { route, HttpError } from "@/platform/http";
import { getWorkspace } from "@/modules/records/workspace";
import { get } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/platform/db";
import { records } from "@/platform/db/schema";
import { buildExport, selectExportRecords } from "@/modules/exports";
import { recordKinds, listValue } from "@/shared/contracts";
import { workflowMatchesExportPeriod } from "@/modules/workflows/export-period";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return route(async () => {
    const query = new URL(request.url).searchParams;
    const kind = z.enum(recordKinds).parse(query.get("kind"));
    const format = z.enum(["pdf", "xlsx", "csv", "ics", "json"]).parse(query.get("format"));
    const context = await requireContext();
    const workspace = await getWorkspace(context);
    let selected = workspace.records[kind];
    const conversationId = query.get("conversationId");
    if (conversationId) {
      if (kind !== "messages")
        throw new HttpError(400, "Ein Chatfilter ist nur für Nachrichten verfügbar.");
      if (!workspace.records.conversations.some((chat) => chat.id === conversationId))
        throw new HttpError(403, "Kein Zugriff auf diesen Chat.");
      selected = selected.filter((row) => row.data.conversationId === conversationId);
    }
    const id = query.get("id"),
      productionId = query.get("productionId"),
      userId = query.get("userId"),
      from = query.get("from") || undefined,
      to = query.get("to") || undefined;
    const materialId = query.get("materialId");
    if (materialId) {
      if (kind !== "reservations")
        throw new HttpError(400, "Ein Artikelfilter ist nur für Reservierungen verfügbar.");
      if (!workspace.records.materials.some((material) => material.id === materialId))
        throw new HttpError(403, "Kein Zugriff auf diesen Artikel.");
      selected = selected.filter((record) => record.data.materialId === materialId);
    }
    const teamOnly = query.get("teamOnly") === "true";
    const generalOnly =
      query.get("generalOnly") === "true" ||
      (kind === "messages" && !productionId && !conversationId);
    if (generalOnly && (!["messages", "looks"].includes(kind) || productionId || conversationId))
      throw new HttpError(
        400,
        "Bitte wähle allgemeine Einträge oder eine einzelne Produktion bzw. einen Chat.",
      );
    if (teamOnly && (kind !== "tasks" || productionId))
      throw new HttpError(400, "Das Teamboard enthält ausschließlich Aufgaben ohne Produktion.");
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)))
      throw new HttpError(400, "Ungültiger Zeitraum.");
    if (from && to && to < from) throw new HttpError(400, "Bitte prüfe den Zeitraum.");
    const userIds = query.has("userIds")
      ? query.get("userIds")!.split(",").filter(Boolean)
      : userId
        ? [userId]
        : undefined;
    const year = query.has("year")
      ? z.coerce.number().int().min(1900).max(2200).parse(query.get("year"))
      : undefined;
    const season = query.get("season") ? z.string().max(200).parse(query.get("season")) : undefined;
    const performanceTime = query.has("performanceTime")
      ? z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte wähle einen gültigen Vorstellungsbeginn.")
          .parse(query.get("performanceTime"))
      : undefined;
    if (performanceTime && kind !== "maskPlans")
      throw new HttpError(400, "Der Vorstellungsbeginn gehört zum Maskenplan-Export.");
    if ((userIds?.length || 0) > 100) throw new HttpError(400, "Zu viele Kalender ausgewählt.");
    if (id) selected = selected.filter((r) => r.id === id);
    selected = selectExportRecords({
      kind,
      records: selected,
      teamOnly,
      generalOnly,
      productionId: productionId || undefined,
      year,
      season,
      references: workspace.records,
    });
    if (userId)
      selected = selected.filter((r) =>
        kind === "events"
          ? listValue(r.data.participantIds).includes(userId)
          : r.data.userId === userId,
      );
    if (userIds !== undefined && kind === "events")
      selected = selected.filter((r) =>
        listValue(r.data.participantIds).some((id) => userIds.includes(id)),
      );
    if (kind === "events" && query.get("category"))
      selected = selected.filter((record) => record.data.category === query.get("category"));
    if (kind !== "events")
      selected = selected.filter((r) => {
        if (["reservations", "shiftSwaps"].includes(kind))
          return workflowMatchesExportPeriod(r, from, to);
        const dates =
          (kind === "time" || kind === "attendance") && Array.isArray(r.data.dayAllocations)
            ? r.data.dayAllocations.map((x) => String((x as { date: string }).date))
            : [String(r.data.date || r.createdAt.slice(0, 10))];
        return dates.some((date) => (!from || date >= from) && (!to || date <= to));
      });
    const images: Record<string, Uint8Array> = {};
    if (["looks", "handovers", "characters", "casting"].includes(kind) && format === "pdf") {
      const ids = Array.from(new Set(selected.flatMap((r) => listValue(r.data.imageIds))));
      if (ids.length > 80)
        throw new HttpError(
          413,
          "Bitte exportiere höchstens 80 Bilder gleichzeitig und teile große Sammelordner in mehrere Exporte auf.",
        );
      const permitted = new Set(workspace.records.files.map((f) => f.id));
      const assets = ids.length
        ? await db
            .select({ id: records.id, data: records.data })
            .from(records)
            .where(
              and(
                eq(records.departmentId, context.departmentId),
                eq(records.kind, "files"),
                inArray(
                  records.id,
                  ids.filter((id) => permitted.has(id)),
                ),
              ),
            )
        : [];
      for (let offset = 0; offset < assets.length; offset += 4) {
        await Promise.all(
          assets.slice(offset, offset + 4).map(async (asset) => {
            const blob = await get(String(asset.data.path), { access: "private" });
            if (blob?.statusCode === 200)
              images[asset.id] = new Uint8Array(await new Response(blob.stream).arrayBuffer());
          }),
        );
      }
    }
    const result = await buildExport({
      kind,
      format,
      records: selected,
      members: workspace.members,
      organization: workspace.organization.name,
      department: workspace.department.name,
      from,
      to,
      view: query.get("view") || undefined,
      references: workspace.records,
      images,
      teamOnly,
      generalOnly,
      productionId: productionId || undefined,
      userIds,
      year,
      season,
      performanceTime,
    });
    return new Response(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
