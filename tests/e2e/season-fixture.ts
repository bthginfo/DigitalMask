import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  onboardingVersion,
  recordKinds,
  type DomainRecord,
  type Workspace,
} from "../../src/shared/contracts";

export const currentSeason = "2026/2027";
export const priorSeason = "2025/2026";
export function seasonWorkspace(role: Workspace["user"]["role"] = "admin") {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.preferences = { accentPalette: "green", onboardingVersion };
  workspace.user.role = role;
  workspace.live = null;
  for (const kind of recordKinds) workspace.records[kind] = [];
  const record = (
    kind: DomainRecord["kind"],
    id: string,
    data: DomainRecord["data"],
    createdAt = "2026-10-03T08:00:00Z",
  ): DomainRecord => ({
    kind,
    id,
    data,
    version: 1,
    organizationId: "qa",
    departmentId: "qa",
    createdBy: workspace.user.id,
    createdAt,
    updatedAt: createdAt,
  });
  workspace.records.productions.push(
    record("productions", "current-play", {
      title: "Ein Sommernachtstraum",
      season: "2026/27",
      status: "active",
      premiere: "2026-11-10",
      color: "#16735c",
    }),
    record("productions", "prior-play", {
      title: "Zauberwald",
      season: "2025/26",
      status: "archived",
      premiere: "2026-03-10",
      color: "#8c76ad",
    }),
  );
  workspace.records.tasks.push(
    record("tasks", "current-task", {
      title: "Perückenwagen vorbereiten",
      status: "todo",
      productionId: "",
      season: currentSeason,
      assigneeIds: [workspace.user.id],
    }),
    record("tasks", "prior-task", {
      title: "Fundusaufnahme abschließen",
      status: "doing",
      productionId: "",
      season: priorSeason,
      assigneeIds: [workspace.user.id],
    }),
    record("tasks", "legacy-task", {
      title: "Alte Materialliste prüfen",
      status: "done",
      productionId: "",
      due: "2026-05-10",
      assigneeIds: [],
    }),
    record("tasks", "prior-production-task", {
      title: "Zauberwald Maske einrichten",
      status: "todo",
      productionId: "prior-play",
      season: priorSeason,
      assigneeIds: [workspace.user.id],
    }),
  );
  workspace.records.actors.push(
    record("actors", "current-actor", {
      name: "Hanna Sommer",
      hair: "Wellig · Braun",
      wigSize: "56 cm",
      notes: "Eigene Maskenhinweise",
      ensembleSeasons: [currentSeason],
    }),
    record("actors", "former-actor", {
      name: "Paul Winter",
      hair: "Kurz · Blond",
      wigSize: "58 cm",
      notes: "Handschriftliche Maße bleiben erhalten",
      ensembleSeasons: [priorSeason],
    }),
    record("actors", "shared-actor", {
      name: "Mira Licht",
      hair: "Lockig",
      wigSize: "55 cm",
      ensembleSeasons: [priorSeason, currentSeason],
    }),
    record("actors", "unassigned-actor", { name: "Gast ohne Spielzeit", ensembleSeasons: [] }),
  );
  workspace.records.characters.push(
    record("characters", "prior-character", { name: "Waldgeist", productionId: "prior-play" }),
  );
  workspace.records.casting.push(
    record("casting", "prior-casting", {
      productionId: "prior-play",
      characterId: "prior-character",
      actorId: "former-actor",
      alternate: false,
    }),
  );
  workspace.records.looks.push(
    record("looks", "current-look", {
      actorName: "Aufschrieb Sommernacht",
      productionId: "current-play",
      sections: [],
      status: "published",
    }),
    record("looks", "prior-look", {
      actorName: "Aufschrieb Zauberwald",
      productionId: "prior-play",
      sections: [],
      status: "published",
    }),
    record("looks", "general-look", {
      actorName: "Allgemeines Perückenwissen",
      productionId: "",
      sections: [],
      status: "published",
    }),
  );
  return workspace;
}

export async function mockSeasons(
  page: Page,
  { dark = false, role = "admin" as Workspace["user"]["role"] } = {},
) {
  const workspace = seasonWorkspace(role);
  const saved: { kind: string; id?: string; data: DomainRecord["data"]; version?: number }[] = [];
  const exports: URLSearchParams[] = [];
  const batches: { sourceIds: string[]; season: string }[] = [];
  const previews: string[] = [];
  let reads = 0;
  await page.clock.setFixedTime(new Date("2026-10-03T10:00:00+02:00"));
  await page.addInitScript(
    ({ dark }) => localStorage.setItem("digitalmask-theme", dark ? "dark" : "light"),
    { dark },
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (path === "/api/export") {
      exports.push(url.searchParams);
      return route.fulfill({ contentType: "text/csv", body: "Name\r\nHanna Sommer\r\n" });
    }
    if (path === "/api/ensemble") {
      if (method === "GET") {
        const season = url.searchParams.get("season") || currentSeason;
        previews.push(season);
        return route.fulfill({
          json: {
            season,
            fetchedAt: "2026-10-03T10:00:00Z",
            summary: { create: 4, update: 1, conflict: 0 },
            entries: Array.from({ length: 5 }, (_, i) => ({
              sourceId: String(i + 1),
              name: i ? `Ensemble Gast ${i}` : "Paul Winter",
              action: i ? "create" : "update",
              ...(i ? {} : { recordId: "former-actor" }),
            })),
          },
        });
      }
      const batch = route.request().postDataJSON() as { sourceIds: string[]; season: string };
      batches.push(batch);
      if (batch.sourceIds.includes("1")) {
        const actor = workspace.records.actors.find((record) => record.id === "former-actor")!;
        actor.data.ensembleSeasons = [
          ...new Set([...(actor.data.ensembleSeasons as string[]), batch.season]),
        ];
      }
      return route.fulfill({
        json: {
          created: batch.sourceIds.filter((id) => id !== "1").length,
          updated: batch.sourceIds.includes("1") ? 1 : 0,
          unchanged: 0,
          images: 0,
          errors: [],
        },
      });
    }
    const match = path.match(/^\/api\/records\/([^/]+)(?:\/([^/]+))?$/);
    if (match && ["POST", "PATCH"].includes(method)) {
      const kind = match[1] as DomainRecord["kind"];
      const { data, version } = route.request().postDataJSON();
      saved.push({ kind, id: match[2], data, version });
      const existing = match[2]
        ? workspace.records[kind].find((record) => record.id === match[2])
        : undefined;
      const record: DomainRecord = existing
        ? { ...existing, data: { ...existing.data, ...data }, version: existing.version + 1 }
        : {
            kind,
            id: `created-${saved.length}`,
            data,
            version: 1,
            organizationId: "qa",
            departmentId: "qa",
            createdBy: workspace.user.id,
            createdAt: "2026-10-03T10:00:00Z",
            updatedAt: "2026-10-03T10:00:00Z",
          };
      if (existing)
        workspace.records[kind] = workspace.records[kind].map((row) =>
          row.id === record.id ? record : row,
        );
      else workspace.records[kind].push(record);
      return route.fulfill({ status: existing ? 200 : 201, json: record });
    }
    return route.fulfill({ json: { messages: [], ok: true } });
  });
  return { workspace, saved, exports, batches, previews, reads: () => reads };
}
