import { test, expect, type Page } from "@playwright/test";
import { currentSeason, priorSeason, mockSeasons } from "./season-fixture";

test.use({ serviceWorkers: "block" });
const artifacts = process.env.E2E_ARTIFACTS_DIR;
async function capture(page: Page, name: string) {
  if (artifacts) await page.screenshot({ path: `${artifacts}/${name}.png` });
}
const seasonPicker = (page: Page) =>
  page.locator("main").getByRole("combobox", { name: "Spielzeit", exact: true });

test("teamboard and documentation start current, filter locally, and new subtasks inherit the selected season", async ({
  page,
}) => {
  const state = await mockSeasons(page);
  await page.goto("/?module=tasks");
  await expect(seasonPicker(page)).toHaveValue("2026/27");
  await expect(
    page.getByRole("button", { name: "Perückenwagen vorbereiten", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fundusaufnahme abschließen", exact: true }),
  ).toHaveCount(0);
  await capture(page, "teamboard-desktop-light");
  const reads = state.reads();
  await seasonPicker(page).selectOption("2025/26");
  await expect(
    page.getByRole("button", { name: "Fundusaufnahme abschließen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Alte Materialliste prüfen", exact: true }),
  ).toBeVisible();
  await seasonPicker(page).selectOption("");
  await expect(page.locator(".task-card")).toHaveCount(3);
  expect(state.reads()).toBe(reads);
  await seasonPicker(page).selectOption("2025/26");
  await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Aufgabe anlegen", exact: true });
  await expect(editor.getByLabel("Spielzeit", { exact: true })).toHaveValue("2025/26");
  await editor.getByLabel("Titel", { exact: false }).fill("Archivaufgabe ergänzen");
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archivaufgabe ergänzen", exact: true }),
  ).toBeVisible();
  expect(state.saved[0].data.season).toBe(priorSeason);
  await page.getByRole("button", { name: "Archivaufgabe ergänzen", exact: true }).click();
  await page.getByRole("button", { name: "Unteraufgabe anlegen", exact: true }).click();
  const subtask = page.getByRole("dialog", { name: "Aufgabe anlegen", exact: true });
  await expect(subtask.getByLabel("Spielzeit", { exact: true })).toHaveValue(priorSeason);
  await subtask.getByLabel("Titel", { exact: false }).fill("Archiv-Unteraufgabe");
  await subtask.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(2);
  expect(state.saved[1].data.season).toBe(priorSeason);
  expect(state.saved[1].data.parentId).toBe("created-1");
  await page.goto("/?module=documentation");
  await expect(seasonPicker(page)).toHaveValue("2026/27");
  await expect(
    page.getByRole("heading", { name: "Aufschrieb Sommernacht", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aufschrieb Zauberwald", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Allgemeines Perückenwissen", exact: true }),
  ).toBeVisible();
  await capture(page, "documentation-desktop-light");
  await page.goto("/?module=today");
  await expect(page.locator(".today-summary > button").first().locator("strong")).toHaveText("1");
  await expect(page.locator(".task-list-row")).toHaveCount(1);
  await expect(page.locator(".task-list-row").first()).toContainText("Perückenwagen vorbereiten");
});

test("mobile actor catalogue retains out-of-season links, editable memberships, new current defaults and season-aware exports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mockSeasons(page, { dark: true, role: "user" });
  await page.goto("/?module=actors");
  await expect(seasonPicker(page)).toHaveValue("2026/27");
  await expect(page.locator(".editorial-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Schauspieler anlegen", exact: true }),
  ).toBeVisible();
  await capture(page, "actors-mobile-dark");
  const reads = state.reads();
  await seasonPicker(page).selectOption("2025/26");
  await expect(page.locator(".editorial-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Exportieren", exact: true }).click();
  const exporting = page.getByRole("dialog", { name: "Schauspieler exportieren", exact: true });
  await exporting.getByRole("combobox", { name: "Format", exact: true }).selectOption("csv");
  await exporting.getByRole("button", { name: "Herunterladen", exact: true }).click();
  await expect.poll(() => state.exports.length).toBe(1);
  expect(state.exports[0].get("season")).toBe("2025/26");
  await exporting.locator("footer").getByRole("button", { name: "Schließen", exact: true }).click();
  await seasonPicker(page).selectOption("");
  await expect(page.locator(".editorial-card")).toHaveCount(4);
  expect(state.reads()).toBe(reads);
  await page.getByRole("button", { name: "Schauspieler anlegen", exact: true }).click();
  const creating = page.getByRole("dialog", { name: "Schauspieler anlegen", exact: true });
  await expect(
    creating.getByLabel("Ensemble-Spielzeiten · Eintrag 1", { exact: true }),
  ).toHaveValue("2026/27");
  await creating.getByLabel("Name", { exact: false }).first().fill("Neuer Gast");
  await creating.getByRole("button", { name: "Eintrag hinzufügen", exact: true }).click();
  await creating
    .getByLabel("Ensemble-Spielzeiten · Eintrag 2", { exact: true })
    .fill("2025 / 2026");
  await capture(page, "actor-memberships-mobile-dark");
  await creating.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0].data.ensembleSeasons).toEqual([currentSeason, priorSeason]);
  await page.goto("/?module=actors&record=former-actor");
  await expect(page.getByRole("dialog", { name: "Paul Winter", exact: true })).toBeVisible();
  await expect(page.locator(".editorial-card").filter({ hasText: "Paul Winter" })).toHaveCount(0);
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const editing = page.getByRole("dialog", { name: "Schauspieler bearbeiten", exact: true });
  await editing.getByRole("button", { name: "Eintrag hinzufügen", exact: true }).click();
  await editing.getByLabel("Ensemble-Spielzeiten · Eintrag 2", { exact: true }).fill("2026/27");
  await editing.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(2);
  expect(state.saved[1]).toMatchObject({
    id: "former-actor",
    version: 1,
    data: { hair: "Kurz · Blond", wigSize: "58 cm", ensembleSeasons: [priorSeason, currentSeason] },
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
});

test("ensemble import targets actual current season independently of archive view and keeps it across all batches", async ({
  page,
}) => {
  const state = await mockSeasons(page, { dark: true });
  await page.goto("/?module=actors");
  await capture(page, "actors-desktop-dark");
  await seasonPicker(page).selectOption("2025/26");
  await page.getByRole("button", { name: "Ensemble laden", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ensemble übernehmen", exact: true });
  await expect(dialog.getByLabel("Ziel-Spielzeit", { exact: true })).toHaveValue("2026/27");
  await dialog.getByRole("button", { name: "Vorschau laden", exact: true }).click();
  await expect(dialog.getByText(`Spielzeit ${currentSeason}`, { exact: true })).toBeVisible();
  await capture(page, "ensemble-import-desktop-dark");
  await dialog.getByRole("button", { name: "Importieren", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Import abgeschlossen", exact: true }),
  ).toBeVisible();
  expect(state.previews).toEqual([currentSeason]);
  expect(state.batches.map((batch) => batch.season)).toEqual([currentSeason, currentSeason]);
  expect(state.batches.map((batch) => batch.sourceIds)).toEqual([["1", "2", "3", "4"], ["5"]]);
  expect(
    state.workspace.records.actors.find((record) => record.id === "former-actor")?.data
      .ensembleSeasons,
  ).toEqual([priorSeason, currentSeason]);
});

test("historical production tasks remain visible and inline actor creation inherits that production season", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockSeasons(page, { role: "user" });
  await page.goto("/?module=productions&productionId=prior-play&tab=tasks");
  await expect(seasonPicker(page)).toHaveValue("2025/26");
  await expect(
    page.getByRole("button", { name: "Zauberwald Maske einrichten", exact: true }),
  ).toBeVisible();
  await capture(page, "historical-tasks-mobile-light");
  await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Spielzeit", { exact: true })).toHaveValue(
    "2025/26",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page
    .locator(".production-tabs")
    .getByRole("button", { name: "Besetzung", exact: true })
    .click();
  await page.getByRole("button", { name: "Besetzung anlegen", exact: true }).first().click();
  await page.getByRole("button", { name: "Schauspielperson direkt anlegen", exact: true }).click();
  const creating = page.getByRole("dialog", { name: "Schauspieler anlegen", exact: true });
  await expect(
    creating.getByLabel("Ensemble-Spielzeiten · Eintrag 1", { exact: true }),
  ).toHaveValue("2025/26");
  await creating.getByLabel("Name", { exact: false }).first().fill("Archiv Gast");
  await creating.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0].data.ensembleSeasons).toEqual([priorSeason]);
  await page.goto("/?module=productions&productionId=prior-play&tab=calendar");
  await page.getByRole("button", { name: /1 Kalender/ }).click();
  await expect(seasonPicker(page)).toHaveValue("2025/26");
  await page.goto("/?module=productions&productionId=prior-play&tab=time");
  await expect(seasonPicker(page)).toHaveValue("2025/26");
});
