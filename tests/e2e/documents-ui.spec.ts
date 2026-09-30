import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Workspace, RecordKind, RecordData } from "../../src/shared/contracts";
const fixture = JSON.parse(readFileSync("tests/e2e/documents-fixture.json", "utf8"));
const test = base.extend<{ engine: "chromium" | "webkit" }>({
  engine: ["chromium", { option: true }],
  page: async ({ playwright, engine, baseURL }, runPage) => {
    const browser = await playwright[engine].launch();
    const context = await browser.newContext({
      baseURL,
      serviceWorkers: "block",
      viewport: engine === "webkit" ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    });
    await runPage(await context.newPage());
    await browser.close();
  },
});
async function mock(page: Page) {
  const workspace = structuredClone(fixture) as Workspace;
  const writes: { kind: string; data: RecordData }[] = [],
    exports: string[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path === "/api/workspace") return route.fulfill({ json: workspace });
    if (path === "/api/history") return route.fulfill({ json: { versions: [] } });
    if (path === "/api/export") {
      exports.push(url.search);
      return route.fulfill({ body: "Synthetic export", contentType: "text/csv" });
    }
    if (path.startsWith("/api/files/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c9dcd0"/><circle cx="300" cy="180" r="100" fill="#6c8b7a"/></svg>',
      });
    if (path.startsWith("/api/records/")) {
      const [, , , kind, id] = path.split("/") as [string, string, string, RecordKind, string];
      const old = workspace.records[kind].find((row) => row.id === id);
      if (req.method() === "DELETE") {
        if (kind === "categories" && id === "qa-category-looks-preparation")
          return route.fulfill({
            status: 409,
            json: { error: "Diese Kategorie wird bereits verwendet." },
          });
        workspace.records[kind] = workspace.records[kind].filter((row) => row.id !== id);
        return route.fulfill({ json: { ok: true } });
      }
      const data = req.postDataJSON().data as RecordData;
      writes.push({ kind, data });
      const record = {
        ...old,
        id: id || `qa-created-${kind}-${writes.length}`,
        kind,
        data: { ...old?.data, ...data },
        createdBy: "qa-admin",
        organizationId: "qa",
        departmentId: "qa",
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      workspace.records[kind] = [
        ...workspace.records[kind].filter((row) => row.id !== record.id),
        record,
      ];
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { ok: true, messages: [] } });
  });
  return { workspace, writes, exports };
}
async function width(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}
for (const browserName of ["chromium", "webkit"] as const)
  test.describe(browserName, () => {
    const mobile = browserName === "webkit";
    test.use({
      engine: browserName,
      serviceWorkers: "block",
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    });
    test("legacy documents preserve content, repeated fields, template and images", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=documentation");
      await expect(
        page.getByRole("heading", { name: "Allgemeine Aufschriebe", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`documents-folders-${browserName}-light.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Nora Beispiel Titania 1 Bilder" }).click();
      await expect(page.getByText("Vorbereitung aus dem Archiv", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Aufschrieb bearbeiten" });
      await expect(editor.getByLabel("Schauspielperson auswählen")).toHaveValue("qa-actor");
      await expect(editor.getByLabel("Titel", { exact: true })).toHaveCount(0);
      await editor
        .getByLabel("Vorbereitung · Text 1", { exact: true })
        .fill("Erste Vorbereitung neu");
      const preparation = editor
        .locator("fieldset")
        .filter({ has: page.locator("legend").filter({ hasText: /^Vorbereitung$/ }) });
      await preparation.getByRole("button", { name: "Textfeld hinzufügen" }).click();
      await editor
        .getByLabel("Vorbereitung · Text 2", { exact: true })
        .fill("Zweiter eigener Text");
      await editor.getByLabel("Vorlage (optional)").selectOption("qa-template");
      await expect(editor.getByLabel("Vorbereitung · Text 1", { exact: true })).toHaveValue(
        "Erste Vorbereitung neu",
      );
      await editor.getByLabel("Stückdauer (Minuten, optional abweichend)").fill("");
      await page.screenshot({
        path: test.info().outputPath(`documents-editor-${browserName}-light.png`),
        fullPage: true,
      });
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(editor).not.toBeVisible();
      const data = state.writes.find((write) => write.kind === "looks")!.data;
      expect(data.imageIds).toEqual(["qa-photo-5"]);
      expect(data.productionDurationMinutes).toBeNull();
      const serialized = JSON.stringify(data.sections);
      expect(serialized).toContain("Zweiter eigener Text");
      expect(serialized).toContain("Legacy Makeup Schritte");
      expect(serialized).toContain("Altes individuelles Feld");
      expect(serialized).toContain("Vorlagenwert");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Bearbeiten", exact: true })
        .click();
      await expect(page.getByLabel("Vorbereitung · Text 2", { exact: true })).toHaveValue(
        "Zweiter eigener Text",
      );
      await width(page);
    });
    test("production directory and inline casting preserve the parent draft and photos", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=productions&productionId=qa-production");
      await expect(page.getByText("Klara Verzeichnis", { exact: false }).first()).toBeVisible();
      await page.getByRole("button", { name: "Produktion verwalten" }).click();
      await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      const prod = page.getByRole("dialog", { name: "Produktion bearbeiten" });
      await expect(prod.getByLabel("Verzeichnis für Kontakt 2")).toHaveValue("qa-contact");
      await prod.getByLabel(/^Titel/).fill("Entwurf bleibt erhalten");
      await prod.getByRole("button", { name: "Kontakt hinzufügen" }).click();
      await prod
        .locator("fieldset")
        .filter({ has: page.locator("legend").filter({ hasText: /^Kontakt 3$/ }) })
        .getByLabel("Rolle", { exact: true })
        .fill("Regie");
      await prod.getByRole("button", { name: "Person anlegen", exact: true }).last().click();
      await prod
        .getByRole("heading", { name: "Person anlegen", exact: true })
        .locator("..")
        .getByLabel(/^Name/)
        .fill("Direktkontakt Test");
      await prod.getByRole("button", { name: "Kontakt anlegen", exact: true }).click();
      await expect(prod.getByRole("heading", { name: "Person anlegen", exact: true })).toHaveCount(
        0,
      );
      await expect(prod.getByLabel(/^Titel/)).toHaveValue("Entwurf bleibt erhalten");
      await page.screenshot({
        path: test.info().outputPath(`documents-contacts-${browserName}-light.png`),
        fullPage: true,
      });
      await prod.getByRole("button", { name: "Abbrechen", exact: true }).click();
      await page.goto("/?module=productions&productionId=qa-production&tab=casting");
      await page
        .getByRole("button", { name: /^Titania/ })
        .first()
        .click();
      await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      const cast = page.getByRole("dialog", { name: "Besetzung bearbeiten" });
      await cast.getByLabel(/^Hinweise/).fill("Der Castingentwurf bleibt");
      await cast.getByRole("button", { name: "Figur direkt anlegen" }).click();
      const figure = page.getByRole("dialog", { name: "Figur anlegen" });
      await figure.getByLabel(/^Figurenname/).fill("Neue Figur");
      await figure.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(cast.getByLabel(/^Hinweise/)).toHaveValue("Der Castingentwurf bleibt");
      await expect(cast.getByLabel("Figur auswählen")).toHaveValue(/qa-created-characters/);
      await cast.getByRole("checkbox", { name: "Namen frei eintragen" }).last().check();
      await cast.getByLabel("Schauspielperson · Name").fill("Freie Schauspielperson");
      await cast.getByRole("button", { name: "Speichern", exact: true }).click();
      const data = state.writes.find((write) => write.kind === "casting")!.data;
      expect(data.imageIds).toEqual(["qa-photo-3", "qa-photo-4"]);
      expect(data.actorId).toBe("");
      expect(data.actorName).toBe("Freie Schauspielperson");
      await width(page);
    });
    test("global handovers and category CRUD surface protected delete and preserve checklist", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=productions&productionId=qa-production&tab=handovers");
      await expect(page.getByRole("heading", { name: "Übergaben", exact: true })).toBeVisible();
      await page.getByText("Früher Dienst", { exact: true }).click();
      await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Dienstübergabe bearbeiten" });
      await expect(editor.getByLabel("Produktion", { exact: true })).toHaveCount(0);
      await expect(editor.getByLabel("Status", { exact: true })).toHaveCount(0);
      await editor.getByLabel("Checkliste · Eintrag 1").fill("Checkliste geändert");
      await editor.getByRole("button", { name: "Eintrag hinzufügen", exact: true }).click();
      await editor.getByLabel("Checkliste · Eintrag 3").fill("Neuer Punkt");
      await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
      await page.screenshot({
        path: test.info().outputPath(`documents-handover-${browserName}-dark.png`),
        fullPage: true,
      });
      await editor.getByRole("button", { name: "Speichern", exact: true }).click();
      const data = state.writes.find((write) => write.kind === "handovers")!.data;
      expect(data.productionId).toBe("");
      expect(data.checklist).toEqual([
        { text: "Checkliste geändert", done: false },
        { text: "Arbeitsplatz geprüft", done: true },
        { text: "Neuer Punkt", done: false },
      ]);
      await page.goto("/?module=documentation");
      await page.getByRole("button", { name: "Abschnitte verwalten", exact: true }).click();
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Vorbereitung löschen", exact: true }).click();
      await expect(page.getByText("Diese Kategorie wird bereits verwendet.")).toBeVisible();
      await page.getByRole("button", { name: "Kategorie anlegen", exact: true }).click();
      await page.getByLabel("Bezeichnung", { exact: true }).fill("Eigener Testabschnitt");
      await page.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(page.getByText("Eigener Testabschnitt", { exact: true })).toBeVisible();
      await width(page);
    });
    test("historical periods align time week and preserve exact export context", async ({
      page,
    }) => {
      const state = await mock(page);
      await page.goto("/?module=documentation");
      await page.getByLabel("Jahr", { exact: true }).fill("2021");
      await expect(
        page.getByRole("heading", { name: "Archivproduktion 2021", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Ein Sommernachtstraum", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      await page.getByLabel(/^Format/).selectOption("csv");
      await page.getByRole("button", { name: "Herunterladen", exact: true }).click();
      await expect.poll(() => state.exports.length).toBe(1);
      expect(state.exports[0]).toContain("year=2021");
      await page.goto("/?module=documentation");
      await page.getByLabel(/^Sammelordner/).selectOption("general");
      await page.getByRole("button", { name: "Exportieren", exact: true }).click();
      await page.getByRole("button", { name: "Herunterladen", exact: true }).click();
      await expect.poll(() => state.exports.length).toBe(2);
      expect(state.exports[1]).toContain("generalOnly=true");
      await page.goto("/?module=time");
      await page.getByRole("button", { name: "Produktions- / Arbeitszeiten", exact: true }).click();
      await page.getByLabel("Jahr", { exact: true }).fill("2021");
      await expect(page.getByLabel("Woche ab", { exact: true })).toHaveValue("2021-10-04");
      await expect(page.getByText("Historische Arbeit", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Zeit nachtragen", exact: true }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Zeitbuchung anlegen" })
          .getByLabel(/^Tätigkeitsbereich/)
          .locator("option"),
      ).toHaveCount(2);
      await width(page);
    });
  });
