import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type Workspace, type DomainRecord } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });
const artifacts = process.env.E2E_ARTIFACTS_DIR;
async function capture(page: Page, name: string) {
  if (artifacts) await page.screenshot({ path: `${artifacts}/${name}.png` });
}
async function mock(page: Page, dark = false, role = "admin") {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.preferences = { accentPalette: "green", onboardingVersion: 1 };
  workspace.user.role = role as Workspace["user"]["role"];
  for (const kind of recordKinds) workspace.records[kind] = [];
  const record = (
    kind: DomainRecord["kind"],
    id: string,
    data: DomainRecord["data"],
  ): DomainRecord => ({
    kind,
    id,
    data,
    version: 1,
    organizationId: "qa",
    departmentId: "qa",
    createdBy: "other",
    createdAt: "2026-10-02T08:00:00Z",
    updatedAt: "2026-10-02T08:00:00Z",
  });
  workspace.records.productions.push(
    record("productions", "play", {
      title: "Abschiedsdinner",
      season: "2026/27",
      status: "active",
      premiere: "2026-10-20",
    }),
  );
  workspace.records.actors.push(
    record("actors", "actor", {
      name: "Michael Amelung",
      contact: "Kontakt über das Theater",
      notes: "Eigene Hinweise bleiben erhalten",
      hair: "Braun",
      biography:
        "Michael Amelung ist Schauspieler am Stadttheater Ingolstadt.\n\nSeine Laufbahn umfasst verschiedene Theaterstationen.",
      sourceUrl:
        "https://theater.ingolstadt.de/ensemble/schauspielerinnen/schauspielerinnen-detailseite/2331.html",
      ensembleStatus: "Ensemble",
      ensembleProductions: ["Abschiedsdinner – Pierre", "Sommernacht – Oberon"],
      portraitCredit: "Testfotografin",
    }),
  );
  workspace.records.characters.push(
    record("characters", "figure", {
      name: "Pierre",
      productionId: "play",
      description: "Vorhandene Figur mit Bild",
    }),
  );
  workspace.records.casting.push(
    record("casting", "cast", {
      productionId: "play",
      characterId: "figure",
      actorId: "actor",
      alternate: false,
    }),
    record("casting", "free", {
      productionId: "play",
      characterName: "Clotilde",
      actorName: "Gastbesetzung",
      alternate: false,
    }),
  );
  workspace.records.files.push(
    record("files", "figure-photo", {
      name: "Figurenbild.png",
      mime: "image/png",
      recordKind: "characters",
      recordId: "figure",
    }),
    record("files", "actor-photo", {
      name: "Porträt.png",
      mime: "image/png",
      recordKind: "actors",
      recordId: "actor",
    }),
  );
  const entries = Array.from({ length: 28 }, (_, i) => ({
    sourceId: String(i + 1),
    name:
      i === 0
        ? "Michael Amelung"
        : i === 27
          ? "Unklare doppelte Person"
          : `Ensemble Person ${String(i + 1).padStart(2, "0")}`,
    action: i === 0 ? "update" : i === 27 ? "conflict" : "create",
    ...(i === 0 ? { recordId: "actor" } : {}),
  }));
  let reads = 0,
    previews = 0;
  const batches: string[][] = [],
    uploads: { recordKind: string; recordId: string }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (path === "/api/ensemble") {
      if (route.request().method() === "GET") {
        previews++;
        return route.fulfill({
          json: {
            fetchedAt: "2026-10-02T10:00:00Z",
            summary: { create: 26, update: 1, conflict: 1 },
            entries,
          },
        });
      }
      const batch = route.request().postDataJSON().sourceIds as string[];
      batches.push(batch);
      return route.fulfill({
        json: {
          created: batch.filter((x) => x !== "1").length,
          updated: batch.includes("1") ? 1 : 0,
          unchanged: 0,
          images: batch.length,
          errors: [],
        },
      });
    }
    if (path === "/api/files" && route.request().method() === "POST") {
      const body = route.request().postDataBuffer()?.toString() || "";
      const recordKind = body.match(/name="recordKind"\r\n\r\n([^\r]+)/)?.[1] || "";
      const recordId = body.match(/name="recordId"\r\n\r\n([^\r]+)/)?.[1] || "";
      uploads.push({ recordKind, recordId });
      const file = record("files", `upload-${uploads.length}`, {
        name: `Bild ${uploads.length}.png`,
        mime: "image/png",
        recordKind,
        recordId,
      });
      workspace.records.files.push(file);
      return route.fulfill({ json: file });
    }
    if (path.startsWith("/api/files/"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5QAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    return route.fulfill({ json: { messages: [], ok: true } });
  });
  await page.addInitScript(
    ({ dark }) => localStorage.setItem("digitalmask-theme", dark ? "dark" : "light"),
    { dark },
  );
  return { reads: () => reads, previews: () => previews, batches, uploads, workspace };
}

for (const width of [1440, 768, 375]) {
  test(`ensemble preview selection and fixed footer ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    const state = await mock(page, width === 375);
    await page.goto("/?module=actors");
    expect(state.previews()).toBe(0);
    await page.getByRole("button", { name: "Ensemble laden", exact: true }).click();
    await page.getByRole("button", { name: "Vorschau laden", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Ensemble übernehmen" });
    await expect(dialog.locator(".ensemble-preview-row")).toHaveCount(28);
    await expect(dialog.locator(".ensemble-preview-row.conflict input")).toBeDisabled();
    await expect(dialog.getByText("27 Personen ausgewählt", { exact: true })).toBeVisible();
    expect(state.previews()).toBe(1);
    const importButton = dialog.getByRole("button", { name: "Importieren", exact: true });
    const bounds = await importButton.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await capture(page, `ensemble-${width}`);
    await dialog
      .locator(".ensemble-import-body")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(dialog.getByText("Unklare doppelte Person", { exact: true })).toBeVisible();
    await capture(page, `ensemble-bottom-${width}`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await dialog.getByLabel("Alle eindeutigen Personen auswählen").uncheck();
    await expect(importButton).toBeDisabled();
    await dialog.locator(".ensemble-import-body").evaluate((el) => (el.scrollTop = 0));
    if (width === 768) await dialog.getByLabel("Alle eindeutigen Personen auswählen").check();
    else await dialog.locator(".ensemble-preview-row").first().locator("input").check();
    const before = state.reads();
    await importButton.click();
    await expect(
      dialog.getByRole("heading", { name: "Import abgeschlossen", exact: true }),
    ).toBeVisible();
    if (width === 768) {
      expect(state.batches.map((batch) => batch.length)).toEqual([4, 4, 4, 4, 4, 4, 3]);
      expect(state.batches.flat()).toEqual(
        Array.from({ length: 27 }, (_, index) => String(index + 1)),
      );
    } else expect(state.batches).toEqual([["1"]]);
    expect(state.reads()).toBe(before + 1);
    await dialog.getByRole("button", { name: "Fertig", exact: true }).click();
    await page
      .getByRole("link", { name: "Michael Amelung · Details und Galerie öffnen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Angaben des Stadttheaters", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Abschiedsdinner – Pierre", { exact: true })).toBeVisible();
    await expect(page.getByText("Testfotografin", { exact: false })).toBeVisible();
    await capture(page, `actor-${width}`);
  });
}

test("production has one Besetzung view, correct KPI and multiple linked image uploads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page);
  await page.goto("/?module=productions&productionId=play&tab=overview");
  await expect(
    page.locator(".overview-links button").filter({ hasText: "Figuren" }).locator("strong"),
  ).toHaveText("2");
  await expect(
    page.locator(".overview-links button").filter({ hasText: "Besetzungen" }).locator("strong"),
  ).toHaveText("2");
  await page
    .locator(".production-tabs")
    .getByRole("button", { name: "Besetzung", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Figuren & Bilder", exact: true })).toHaveCount(0);
  await expect(page.locator(".editorial-card")).toHaveCount(2);
  await page
    .getByRole("link", {
      name: "Pierre · Michael Amelung · Details und Galerie öffnen",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Bilder dieser Besetzung", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Vorhandene Bilder der Figur", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Figurenbild.png", exact: true })).toBeVisible();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5QAAAABJRU5ErkJggg==",
    "base64",
  );
  await dialog.locator("input[type=file]").setInputFiles([
    { name: "makeup.png", mimeType: "image/png", buffer: png },
    { name: "haare.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(dialog.getByRole("img", { name: "Bild 2.png", exact: true })).toBeVisible();
  expect(state.uploads).toEqual([
    { recordKind: "casting", recordId: "cast" },
    { recordKind: "casting", recordId: "cast" },
  ]);
  await capture(page, "casting-mobile");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});

test("normal team member cannot see Ensemble import", async ({ page }) => {
  await mock(page, false, "user");
  await page.goto("/?module=actors");
  await expect(page.getByRole("heading", { name: "Schauspieler", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ensemble laden", exact: true })).toHaveCount(0);
});

test("productions default to current season and allow selecting all seasons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-02T10:00:00+02:00"));
  const state = await mock(page);
  state.workspace.records.productions.push({
    ...state.workspace.records.productions[0],
    id: "older-production",
    data: {
      title: "Vorjährige Produktion",
      season: "2025/26",
      status: "active",
      premiere: "2026-04-14",
    },
  });
  await page.goto("/?module=productions");
  const season = page.getByRole("combobox", { name: "Spielzeit", exact: true });
  await expect(season).toHaveValue("2026/27");
  await expect(page.locator(".production-card")).toHaveCount(1);
  await expect(
    page.locator(".production-card").filter({ hasText: "Abschiedsdinner" }),
  ).toBeVisible();
  await expect(
    page.locator(".production-card").filter({ hasText: "Vorjährige Produktion" }),
  ).toHaveCount(0);
  const before = state.reads();
  await season.selectOption("");
  await expect(page.locator(".production-card")).toHaveCount(2);
  await expect(
    page.locator(".production-card").filter({ hasText: "Vorjährige Produktion" }),
  ).toBeVisible();
  expect(state.reads()).toBe(before);
  await season.selectOption("2025/26");
  await expect(page.locator(".production-card")).toHaveCount(1);
  await expect(
    page.locator(".production-card").filter({ hasText: "Vorjährige Produktion" }),
  ).toBeVisible();
  await capture(page, "productions-season-mobile");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});
