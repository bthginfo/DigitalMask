import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  recordKinds,
  type Workspace,
  type Role,
  type RecordData,
} from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });
const fixtureJson = JSON.parse(readFileSync("tests/e2e/profile-help-fixture.json", "utf8"));

async function mock(
  page: Page,
  options: { role?: Role; firstLogin?: boolean; missingPreferences?: boolean } = {},
) {
  const workspace = structuredClone(fixtureJson) as Workspace;
  workspace.user.role = options.role || "admin";
  if (options.role === "superadmin")
    workspace.user = { ...workspace.members.find((member) => member.id === "qa-super")! };
  if (options.firstLogin) workspace.user.preferences!.onboardingVersion = 0;
  if (options.missingPreferences) delete workspace.user.preferences;
  for (const kind of recordKinds) workspace.records[kind] ||= [];
  const writes: { action?: string; data: RecordData; kind?: string }[] = [];
  let reads = 0;
  let failProfile = false;
  let expired = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/workspace") {
      reads++;
      if (expired) return route.fulfill({ status: 401, json: { error: "QA Session abgelaufen" } });
      return route.fulfill({ json: workspace });
    }
    if (pathname === "/api/actions") {
      const body = request.postDataJSON();
      writes.push(body);
      if (body.action === "profile-update") {
        if (failProfile) {
          failProfile = false;
          return route.fulfill({ status: 503, json: { error: "QA Speicherung nicht verfügbar" } });
        }
        workspace.user.preferences = {
          accentPalette:
            body.data.accentPalette || workspace.user.preferences?.accentPalette || "green",
          onboardingVersion: body.data.onboardingCompleted
            ? 1
            : workspace.user.preferences?.onboardingVersion || 0,
        };
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname.startsWith("/api/records/feedback")) {
      const body = request.postDataJSON();
      writes.push({ kind: "feedback", data: body.data });
      const id = pathname.split("/")[4] || "qa-new-feedback";
      const existing = workspace.records.feedback.find((row) => row.id === id);
      const row = {
        id,
        kind: "feedback" as const,
        data: {
          type: "feature",
          status: "new",
          userId: workspace.user.id,
          ...existing?.data,
          ...body.data,
        },
        createdBy: workspace.user.id,
        organizationId: "qa",
        departmentId: "qa",
        createdAt: "2026-09-30T09:00:00Z",
        updatedAt: "2026-09-30T09:00:00Z",
        version: (existing?.version || 0) + 1,
      };
      workspace.records.feedback = [
        ...workspace.records.feedback.filter((row) => row.id !== id),
        row,
      ];
      return route.fulfill({ json: row });
    }
    if (pathname === "/api/messages") return route.fulfill({ json: { messages: [] } });
    return route.fulfill({ json: { ok: true, messages: [] } });
  });
  return {
    workspace,
    writes,
    reads: () => reads,
    failNextProfile: () => {
      failProfile = true;
    },
    expire: () => {
      expired = true;
    },
  };
}

test.describe("Profil und Hilfe", () => {
  for (const mobile of [false, true]) {
    test.describe(mobile ? "mobile" : "desktop", () => {
      test.use({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      });
      test("palette preview, keyboard, explicit persistence and account reset", async ({
        page,
      }) => {
        const state = await mock(page);
        await page.goto("/?module=settings");
        await expect(
          page.getByRole("heading", { name: "Einstellungen", exact: true }),
        ).toBeVisible();
        const lavender = page.getByRole("radio", { name: "Lavendel", exact: true });
        await lavender.check();
        await expect(page.locator("html")).toHaveAttribute("data-accent", "lavender");
        expect(state.writes).toHaveLength(0);
        await page.getByRole("button", { name: "Dunkel", exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        expect(state.writes).toHaveLength(0);
        await lavender.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("radio", { name: "Pfirsich", exact: true })).toBeChecked();
        await page.getByRole("button", { name: "Vorschau verwerfen" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
        await page.getByRole("radio", { name: "Himmel", exact: true }).check();
        await page.getByRole("button", { name: "Farbe speichern", exact: true }).click();
        await expect.poll(() => state.workspace.user.preferences?.accentPalette).toBe("sky");
        expect(state.writes).toHaveLength(1);
        expect(state.writes[0].data).toEqual({ accentPalette: "sky" });
        await page.reload();
        await expect(page.getByRole("radio", { name: "Himmel", exact: true })).toBeChecked();
        await expect(page.locator("html")).toHaveAttribute("data-accent", "sky");
        // Leaving an unsaved preview restores the persisted account palette.
        await page.getByRole("radio", { name: "Rosé", exact: true }).check();
        await page.goto("/?module=help");
        await expect(page.locator("html")).toHaveAttribute("data-accent", "sky");
        if (mobile) await page.getByRole("button", { name: "Menü öffnen" }).click();
        await page.getByRole("button", { name: "Abmelden", exact: true }).click();
        await expect(page).toHaveURL(/\/login/);
        await expect(page.locator("html")).not.toHaveAttribute("data-accent");
      });
      test("expired session removes an unsaved account palette", async ({ page }) => {
        const state = await mock(page);
        await page.goto("/?module=settings");
        await page.getByRole("radio", { name: "Lavendel", exact: true }).check();
        await expect(page.locator("html")).toHaveAttribute("data-accent", "lavender");
        state.expire();
        await page.getByRole("button", { name: "Daten aktualisieren", exact: true }).click();
        await expect(page).toHaveURL(/\/login/);
        await expect(page.locator("html")).not.toHaveAttribute("data-accent");
        await expect(page.locator("html")).not.toHaveAttribute("data-accent-owner");
        expect(state.writes).toHaveLength(0);
      });
      test("first login tour navigates eight steps, persists once and can restart", async ({
        page,
      }) => {
        const state = await mock(page, { firstLogin: true });
        await page.goto("/");
        const dialog = page.getByRole("dialog", { name: "Dein Einstieg in DigitalMask" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("status")).toHaveText("Schritt 1 von 8");
        await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
        await expect(page).toHaveURL(/module=productions/);
        await dialog.getByRole("button", { name: "Zurück", exact: true }).click();
        await expect(dialog.getByRole("status")).toHaveText("Schritt 1 von 8");
        for (let i = 0; i < 7; i++)
          await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
        await expect(dialog.getByRole("status")).toHaveText("Schritt 8 von 8");
        expect(state.reads()).toBe(1);
        expect(state.writes).toHaveLength(0);
        await dialog.getByRole("radio", { name: "Sand", exact: true }).check();
        await dialog.getByRole("button", { name: "Farbe speichern & loslegen" }).click();
        await expect(dialog).not.toBeVisible();
        expect(state.writes).toHaveLength(1);
        expect(state.writes[0].data).toEqual({
          onboardingCompleted: true,
          accentPalette: "sand",
        });
        await expect(page.locator("html")).toHaveAttribute("data-accent", "sand");
        await page.reload();
        await expect(
          page.getByRole("heading", { name: /Guten|Willkommen|Heute|Dein Tag/ }).first(),
        ).toBeVisible();
        await expect(dialog).not.toBeVisible();
        await page.goto("/?module=help");
        await page.getByRole("button", { name: "Einführung neu starten" }).click();
        await expect(dialog).toBeVisible();
        state.failNextProfile();
        await page.keyboard.press("Escape");
        await expect(dialog.getByRole("alert")).toHaveText("QA Speicherung nicht verfügbar");
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(page.locator("main")).toBeFocused();
      });
      test("help, own feedback history and text editing", async ({ page }) => {
        const state = await mock(page, { missingPreferences: true });
        await page.goto("/?module=help");
        await expect(page.getByRole("heading", { name: "Hilfe & Orientierung" })).toBeVisible();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await page.getByRole("textbox", { name: "Hilfe durchsuchen" }).fill("Bilder");
        await expect(page.locator(".help-article")).toContainText(/Bilder|Fotos/);
        await page.getByRole("button", { name: "Häufige Fragen", exact: true }).click();
        const first = page.locator("summary").first();
        await first.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("details").first()).toHaveAttribute("open", "");
        await page.getByRole("button", { name: "Ideen & Fehler", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Meine Rückmeldungen" })).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Favoriten für häufige Aufschriebe" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Darstellung einer langen Materialbezeichnung" }),
        ).not.toBeVisible();
        await expect(page.getByRole("combobox", { name: /^Status von/ })).toHaveCount(0);
        await page.getByRole("button", { name: "Idee oder Fehler melden", exact: true }).click();
        const editor = page.getByRole("dialog", { name: "Idee oder Fehler melden" });
        await editor.getByRole("radio", { name: "Fehler", exact: true }).check();
        await editor
          .getByRole("textbox", { name: "Titel", exact: true })
          .fill("QA Bedienung verbessern");
        await editor
          .getByRole("textbox", { name: "Beschreibung" })
          .fill("Fiktive Schritte für eine reproduzierbare Meldung.");
        await editor.getByRole("button", { name: "Rückmeldung senden" }).click();
        await expect(editor).not.toBeVisible();
        expect(state.writes[0].data).toEqual({
          type: "bug",
          title: "QA Bedienung verbessern",
          description: "Fiktive Schritte für eine reproduzierbare Meldung.",
        });
        await page.getByRole("button", { name: "QA Bedienung verbessern" }).click();
        await page.getByRole("button", { name: "Rückmeldung bearbeiten" }).click();
        await page
          .getByRole("dialog")
          .getByRole("textbox", { name: "Titel", exact: true })
          .fill("QA Überarbeitete Meldung");
        await page.getByRole("button", { name: "Änderungen speichern" }).click();
        await expect(page.getByRole("dialog", { name: "QA Überarbeitete Meldung" })).toBeVisible();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Schließen", exact: true })
          .last()
          .click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
          mobile ? 390 : 1440,
        );
      });
      test("superadmin queue and exclusion from active staff selectors", async ({ page }) => {
        const state = await mock(page, { role: "superadmin" });
        await page.goto("/?module=help");
        await page.getByRole("button", { name: "Ideen & Fehler", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Bearbeitungsübersicht" })).toBeVisible();
        await page
          .getByRole("combobox", {
            name: "Status von Darstellung einer langen Materialbezeichnung",
          })
          .selectOption("planned");
        await expect
          .poll(
            () =>
              state.workspace.records.feedback.find((row) => row.id === "qa-other-feedback")?.data
                .status,
          )
          .toBe("planned");
        expect(state.writes[0].data).toEqual({ status: "planned" });
        await page
          .getByRole("button", { name: "Darstellung einer langen Materialbezeichnung" })
          .click();
        await expect(
          page.getByRole("button", { name: "Rückmeldung bearbeiten" }),
        ).not.toBeVisible();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Schließen", exact: true })
          .last()
          .click();
        await page.goto("/?module=tasks");
        await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
        await expect(page.getByRole("dialog").getByText("Systemverwaltung QA")).not.toBeVisible();
        await expect(page.getByRole("dialog").locator("input[type=checkbox]:checked")).toHaveCount(
          0,
        );
        await page.keyboard.press("Escape");
        await page.goto("/?module=calendar");
        await expect(page.locator(".calendar-filters")).not.toContainText("Systemverwaltung QA");
        await expect(page.getByRole("button", { name: "Nur meinen Kalender" })).not.toBeVisible();
        await page.goto("/?module=time");
        await expect(page.locator("select option", { hasText: "Systemverwaltung QA" })).toHaveCount(
          0,
        );
        await page.goto("/?module=productions&productionId=qa-production&tab=team");
        await page.getByRole("button", { name: "Team & Kontakte bearbeiten" }).click();
        let teamEditor = page.getByRole("dialog");
        await expect(teamEditor.getByText("Systemverwaltung QA")).not.toBeVisible();
        await teamEditor.getByRole("combobox", { name: "Zuordnung" }).selectOption("makeup");
        await expect(
          teamEditor.locator("select option", { hasText: "Systemverwaltung QA" }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        // Historical membership remains visible for explicit removal, and cannot be reassigned.
        state.workspace.records.productions[0].data.memberIds = ["qa-admin", "qa-user", "qa-super"];
        await page.reload();
        await page.getByRole("button", { name: "Team & Kontakte bearbeiten" }).click();
        teamEditor = page.getByRole("dialog");
        const historical = teamEditor.getByRole("checkbox", { name: /Systemverwaltung QA/ });
        await expect(historical).toBeChecked();
        await historical.click();
        await expect(historical).toHaveCount(0);
        await page.keyboard.press("Escape");
      });
    });
  }
});
