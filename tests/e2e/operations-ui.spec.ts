import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  recordKinds,
  type Workspace,
  type RecordKind,
  type RecordData,
} from "../../src/shared/contracts";
const fixture = JSON.parse(readFileSync("tests/e2e/operations-fixture.json", "utf8"));
test.use({ serviceWorkers: "block" });
async function mock(
  page: Page,
  options: { superadmin?: boolean; tour?: boolean; emptyCategories?: boolean } = {},
) {
  const workspace = structuredClone(fixture) as Workspace;
  for (const kind of recordKinds) workspace.records[kind] ||= [];
  if (options.superadmin)
    workspace.user = {
      ...workspace.members.find((person) => person.role === "superadmin")!,
      preferences: { accentPalette: "green", onboardingVersion: 1 },
    };
  if (options.tour) workspace.user.preferences!.onboardingVersion = 0;
  if (options.emptyCategories) workspace.records.calendarCategories = [];
  let reads = 0;
  const writes: { action?: string; kind?: string; data: RecordData; method?: string }[] = [],
    exports: string[] = [];
  const row = (
    kind: RecordKind,
    id: string,
    data: RecordData,
    old?: (typeof workspace.records.time)[number],
  ) => ({
    id,
    kind,
    data,
    createdBy: old?.createdBy || workspace.user.id,
    organizationId: "qa",
    departmentId: "qa",
    version: (old?.version || 0) + 1,
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (path === "/api/messages") return route.fulfill({ json: { messages: [] } });
    if (path === "/api/export") {
      exports.push(url.search);
      return route.fulfill({ contentType: "text/csv", body: "QA synthetic export" });
    }
    if (path === "/api/actions") {
      const body = req.postDataJSON();
      writes.push(body);
      const action = body.action as string;
      if (action === "profile-update")
        workspace.user.preferences = {
          ...workspace.user.preferences!,
          onboardingVersion: 1,
          ...(body.data.accentPalette ? { accentPalette: body.data.accentPalette } : {}),
        };
      if (action.includes("timer-")) {
        const attendance = action.startsWith("attendance-"),
          key = attendance ? "attendanceTimer" : "timer",
          kind = attendance ? "attendance" : "time";
        const timer = workspace[key];
        if (action.endsWith("start"))
          workspace[key] = {
            id: `qa-${key}`,
            data: {
              ...body.data,
              startedAt: new Date(Date.now() - 600000).toISOString(),
              pausedAt: null,
              pauseSeconds: 0,
            },
          };
        if (action.endsWith("pause") && timer) timer.data.pausedAt = new Date().toISOString();
        if (action.endsWith("resume") && timer) timer.data.pausedAt = null;
        if (action.endsWith("discard")) workspace[key] = null;
        if (action.endsWith("stop") && timer) {
          const data = {
            ...timer.data,
            start: timer.data.startedAt,
            end: new Date().toISOString(),
            durationSeconds: 600,
            pauseSeconds: 0,
            userId: workspace.user.id,
            date: "2026-09-30",
          };
          const record = row(kind, `qa-booked-${kind}`, data);
          workspace.records[kind].push(record);
          workspace[key] = null;
          return route.fulfill({ json: record });
        }
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (path.startsWith("/api/records/")) {
      const [, , , kind, id] = path.split("/") as [string, string, string, RecordKind, string];
      const existing = workspace.records[kind]?.find((record) => record.id === id);
      const body = req.method() === "DELETE" ? { data: {} } : req.postDataJSON();
      writes.push({ kind, data: body.data, method: req.method() });
      if (req.method() === "DELETE") {
        if (kind === "calendarCategories" && id === "qa-vacation")
          return route.fulfill({
            status: 409,
            json: { error: "Diese Kalenderart wird bereits verwendet." },
          });
        workspace.records[kind] = workspace.records[kind].filter((record) => record.id !== id);
        return route.fulfill({ json: { ok: true } });
      }
      const data = {
        ...existing?.data,
        ...body.data,
        ...(kind === "time" || kind === "attendance" || kind === "messages"
          ? { userId: workspace.user.id }
          : {}),
      };
      const record = row(kind, id || `qa-created-${kind}-${writes.length}`, data, existing);
      workspace.records[kind] = [
        ...workspace.records[kind].filter((oldRecord) => oldRecord.id !== record.id),
        record,
      ];
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return { workspace, writes, exports, reads: () => reads };
}
async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}
for (const mobile of [false, true])
  test.describe(mobile ? "mobile" : "desktop", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    test("parallel timers remain independent; stop creates editable attendance", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=time");
      const attendance = page.getByRole("region", { name: "Anwesenheitstimer" }),
        work = page.getByRole("region", { name: "Arbeitstimer" });
      await attendance.getByRole("button", { name: "Anwesenheit starten" }).click();
      await work.getByLabel("Tätigkeit", { exact: true }).fill("Perücke vorbereiten");
      await work.getByRole("button", { name: "Arbeitstimer starten" }).click();
      await expect(attendance.getByText("Timer läuft")).toBeVisible();
      await expect(work.getByText("Timer läuft")).toBeVisible();
      await attendance.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(attendance.getByText("Pausiert")).toBeVisible();
      await expect(work.getByText("Timer läuft")).toBeVisible();
      await attendance.getByRole("button", { name: "Stoppen & buchen" }).click();
      const editor = page.getByRole("dialog", { name: "Anwesenheit bearbeiten" });
      await expect(editor).toBeVisible();
      expect(state.workspace.attendanceTimer).toBeNull();
      expect(state.workspace.timer).not.toBeNull();
      await editor.getByLabel("Bezeichnung (optional)").fill("Anwesenheit korrigiert");
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(editor).not.toBeVisible();
      const write = state.writes.find((write) => write.kind === "attendance")!;
      expect(write.data).not.toHaveProperty("productionId");
      expect(write.data.title).toBe("Anwesenheit korrigiert");
      expect(state.writes.filter((write) => write.action?.includes("timer"))).toHaveLength(4);
      await noOverflow(page);
    });
    test("manual attendance has Berlin interval, pause and separate offline/export scopes", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=time");
      await page.getByRole("button", { name: "Anwesenheit nachtragen" }).click();
      let editor = page.getByRole("dialog", { name: "Anwesenheit anlegen" });
      await editor.getByLabel("Beginn", { exact: true }).fill("2026-10-24T23:00");
      await editor.getByLabel("Ende", { exact: true }).fill("2026-10-25T04:00");
      await editor.getByLabel("Pause in Minuten").fill("30");
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(editor).not.toBeVisible();
      const data = state.writes.find((write) => write.kind === "attendance")!.data;
      expect(data.start).toBe("2026-10-24T21:00:00.000Z");
      expect(data.end).toBe("2026-10-25T03:00:00.000Z");
      expect(data.durationSeconds).toBe(19800);
      expect(data).not.toHaveProperty("productionId");
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
        window.dispatchEvent(new Event("offline"));
      });
      await page.getByRole("button", { name: "Ohne Internet vormerken", exact: true }).click();
      editor = page.getByRole("dialog", { name: "Anwesenheit offline vormerken" });
      await editor.getByRole("button", { name: "Lokal speichern" }).click();
      await expect(page.getByText("1 lokale Anwesenheitsentwürfe")).toBeVisible();
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
        window.dispatchEvent(new Event("online"));
      });
      await page.getByRole("button", { name: "Anwesenheit synchronisieren" }).click();
      expect(state.writes.filter((write) => write.kind === "attendance")).toHaveLength(2);
      await expect(page.getByText("1 lokale Anwesenheitsentwürfe")).not.toBeVisible();
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      const exportDialog = page.getByRole("dialog", { name: "Anwesenheit exportieren" });
      await expect(exportDialog).toBeVisible();
      await exportDialog.getByLabel("Format").selectOption("csv");
      await exportDialog.getByRole("button", { name: "Herunterladen", exact: true }).click();
      expect(new URLSearchParams(state.exports.at(-1)).get("kind")).toBe("attendance");
      await noOverflow(page);
    });
    test("team month retains cached workspace, named empty-title events and all-day range", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=calendar");
      await page.getByRole("button", { name: "Team", exact: true }).click();
      await page.getByRole("button", { name: "Teammonat", exact: true }).click();
      const region = page.getByRole("region", {
        name: mobile ? "Mobiler Teammonatskalender" : "Teammonatskalender",
        exact: true,
      });
      await expect(region).toBeVisible();
      expect(
        await region.locator(mobile ? "button[data-date]" : "thead th").count(),
      ).toBeGreaterThanOrEqual(28);
      await page.getByRole("button", { name: "Nächster Zeitraum" }).click();
      await page.getByRole("button", { name: "Vorheriger Zeitraum" }).click();
      expect(state.reads()).toBe(1);
      await noOverflow(page);
      if (mobile) await page.locator(".calendar-mobile-actions > summary").click();
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      const exportDialog = page.getByRole("dialog", { name: "Kalender exportieren" });
      await exportDialog.getByLabel("Format").selectOption("csv");
      await exportDialog.getByRole("button", { name: "Herunterladen", exact: true }).click();
      expect(new URLSearchParams(state.exports.at(-1)).get("view")).toBe("team-month");
      await exportDialog.getByRole("button", { name: "Schließen", exact: true }).last().click();
      await page.getByRole("button", { name: "Termin", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Termin anlegen" });
      await editor.getByLabel("Kalenderart").selectOption("vacation");
      await expect(editor.locator('input[type="datetime-local"]')).toHaveCount(0);
      await editor.getByLabel("Von", { exact: true }).fill("2026-10-24");
      await editor.getByLabel("Bis (einschließlich)").fill("2026-10-25");
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(editor).not.toBeVisible();
      const data = state.writes.find((write) => write.kind === "events")!.data;
      expect(data.title).toBe("");
      expect(data.start).toBe("2026-10-23T22:00:00.000Z");
      expect(data.end).toBe("2026-10-25T23:00:00.000Z");
      expect(data.allDay).toBe(true);
    });
    test("deleted category list stays empty and cannot approve leave silently", async ({
      page,
    }) => {
      const state = await mock(page, { emptyCategories: true });
      await page.goto("/?module=calendar");
      if (mobile) await page.locator(".calendar-filter-toggle").click();
      await expect(page.getByLabel("Kategorie").locator("option")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Genehmigen", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Termin", exact: true }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Termin anlegen" })
          .getByLabel("Kalenderart")
          .locator("option"),
      ).toHaveCount(1);
      expect(state.writes).toHaveLength(0);
    });
    test("calendar kinds handle conflict and leave approval uses available all-day kind", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=calendar");
      if (mobile) await page.locator(".calendar-mobile-actions > summary").click();
      await page.getByRole("button", { name: "Kalenderarten", exact: true }).click();
      await page.getByRole("button", { name: "Kalenderart anlegen" }).click();
      const editor = page.getByRole("dialog", { name: "Kalenderart anlegen" });
      await editor.getByLabel("Bezeichnung", { exact: true }).fill("Werkstatttag");
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Kalenderarten verwalten" })).toBeVisible();
      expect(state.writes.find((write) => write.kind === "calendarCategories")!.data.key).toMatch(
        /^category-/,
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Urlaub löschen", exact: true }).click();
      await expect(page.locator(".error-message")).toHaveText(
        "Diese Kalenderart wird bereits verwendet.",
      );
      await page.getByRole("button", { name: "Schließen", exact: true }).last().click();
      const picker = page.getByLabel("Als Kalenderart");
      await expect(picker).toHaveValue("vacation");
      await picker.selectOption("sick");
      await page.getByRole("button", { name: "Genehmigen", exact: true }).click();
      expect(state.writes.find((write) => write.action === "leave-decide")!.data.category).toBe(
        "sick",
      );
    });
    test("private chat isolation, own edit, participant creation and archival", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=chat");
      await expect(page.getByText("Allgemeine Teaminformation", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Nur für die private Vorbereitung", { exact: true }),
      ).not.toBeVisible();
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      let exportDialog = page.getByRole("dialog", { name: "Nachrichten exportieren" });
      await exportDialog.getByLabel("Format").selectOption("csv");
      await exportDialog.getByRole("button", { name: "Herunterladen", exact: true }).click();
      expect(new URLSearchParams(state.exports.at(-1)).get("generalOnly")).toBe("true");
      await exportDialog.getByRole("button", { name: "Schließen", exact: true }).last().click();
      await page.getByRole("button", { name: "Vorbereitung Premiere", exact: true }).click();
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      exportDialog = page.getByRole("dialog", { name: "Nachrichten exportieren" });
      await exportDialog.getByLabel("Format").selectOption("csv");
      await exportDialog.getByRole("button", { name: "Herunterladen", exact: true }).click();
      expect(new URLSearchParams(state.exports.at(-1)).get("conversationId")).toBe("qa-private");
      await exportDialog.getByRole("button", { name: "Schließen", exact: true }).last().click();
      await expect(
        page.getByText("Nur für die private Vorbereitung", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Allgemeine Teaminformation", { exact: true })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /Nachricht von .* bearbeiten/ })).toHaveCount(
        1,
      );
      await page.getByRole("button", { name: /Nachricht von .* bearbeiten/ }).click();
      const edit = page.getByRole("dialog", { name: "Eigene Nachricht bearbeiten" });
      await edit.getByLabel("Nachricht", { exact: true }).fill("Korrigierte Nachricht");
      await edit.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page.getByText("Korrigierte Nachricht", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Verwalten", exact: true }).click();
      await page.getByRole("button", { name: "Archivieren", exact: true }).click();
      await expect(page.locator(".chat-archived-note")).toBeVisible();
      await expect(page.locator(".chat-composer")).toHaveCount(0);
      await page.getByRole("button", { name: "Privater Chat", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Privaten Chat starten" });
      await expect(editor.getByText("Root Administration", { exact: true })).not.toBeVisible();
      await editor.getByRole("radio", { name: "Gruppe", exact: true }).check();
      await editor.getByLabel("Gruppenname (optional)").fill("Neue Gruppe");
      await editor.locator('input[type="checkbox"]').first().check();
      await editor.getByRole("button", { name: "Chat starten", exact: true }).click();
      await expect(page.locator(".chat-heading h2")).toHaveText("Neue Gruppe");
      const data = state.writes.filter((write) => write.kind === "conversations").at(-1)!.data;
      expect(data.participantIds).toContain(state.workspace.user.id);
      await noOverflow(page);
    });
    test("production cards preserve makeup names, client sorting and scoped time", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=productions");
      const cards = page.locator(".production-card");
      await expect(cards.first().locator("h2")).toHaveText(
        String(state.workspace.records.productions[0].data.title),
      );
      await expect(cards.first().locator(".production-card-makeup")).toContainText("Klara Extern");
      await page.getByLabel("Sortieren nach").selectOption("name-desc");
      await expect(cards.first().locator("h2")).toHaveText("Zweite Premiere");
      expect(state.reads()).toBe(1);
      await cards.filter({ hasText: "Klara Extern" }).click();
      await expect(page.locator(".production-makeup-contact")).toContainText("Klara Extern");
      await page.getByRole("button", { name: "Zeiten", exact: true }).click();
      await expect(page.getByRole("region", { name: "Anwesenheitstimer" })).toHaveCount(0);
      await noOverflow(page);
    });
    test("tour leaves real content sharp and visible; superadmin has no self timers", async ({
      page,
    }) => {
      const state = await mock(page, { tour: true });
      await page.goto("/");
      const tour = page.getByRole("dialog", { name: "Dein Einstieg in DigitalMask" });
      await expect(tour).toBeVisible();
      expect(
        await tour.evaluate((node) => getComputedStyle(node, "::backdrop").backdropFilter),
      ).toBe("none");
      await tour.getByRole("button", { name: "Weiter", exact: true }).click();
      await expect(page.locator(".production-card").first()).toBeAttached();
      expect(state.reads()).toBe(1);
      expect(state.writes).toHaveLength(0);
      await tour.getByRole("button", { name: "Einführung überspringen" }).click();
      await expect(tour).not.toBeVisible();
      await mock(page, { superadmin: true });
      await page.goto("/?module=time");
      await expect(page.getByRole("region", { name: "Anwesenheitstimer" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Anwesenheit nachtragen" })).toHaveCount(0);
      await expect(page.getByLabel("Person").locator("option")).not.toContainText([
        "Root Administration",
      ]);
      await noOverflow(page);
    });
  });
