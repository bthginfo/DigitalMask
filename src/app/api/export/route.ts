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
    const id = query.get("id"),
      productionId = query.get("productionId"),
      userId = query.get("userId"),
      from = query.get("from") || undefined,
      to = query.get("to") || undefined;
    const teamOnly = query.get("teamOnly") === "true";
    if (teamOnly && (kind !== "tasks" || productionId))
      throw new HttpError(400, "Das Teamboard enthält ausschließlich Aufgaben ohne Produktion.");
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)))
      throw new HttpError(400, "Ungültiger Zeitraum.");
    if (from && to && to < from) throw new HttpError(400, "Bitte prüfe den Zeitraum.");
    const userIds = query.get("userIds")?.split(",").filter(Boolean) || [];
    if (userIds.length > 100) throw new HttpError(400, "Zu viele Kalender ausgewählt.");
    if (id) selected = selected.filter((r) => r.id === id);
    selected = selectExportRecords({
      kind,
      records: selected,
      teamOnly,
      productionId: productionId || undefined,
    });
    if (userId)
      selected = selected.filter((r) =>
        kind === "events"
          ? listValue(r.data.participantIds).includes(userId)
          : r.data.userId === userId,
      );
    if (userIds.length && kind === "events")
      selected = selected.filter((r) =>
        listValue(r.data.participantIds).some((id) => userIds.includes(id)),
      );
    if (kind !== "events")
      selected = selected.filter((r) => {
        const dates =
          kind === "time" && Array.isArray(r.data.dayAllocations)
            ? r.data.dayAllocations.map((x) => String((x as { date: string }).date))
            : [String(r.data.date || r.createdAt.slice(0, 10))];
        return dates.some((date) => (!from || date >= from) && (!to || date <= to));
      });
    const images: Record<string, Uint8Array> = {};
    if (["looks", "characters", "casting"].includes(kind) && format === "pdf") {
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
      productionId: productionId || undefined,
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
