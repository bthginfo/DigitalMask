import { expect, test } from "@playwright/test";
import { maskPlanSchema } from "../../src/modules/mask-plans/schema";
import { maskPlanFixture } from "./mask-plans-fixture";
import { installMaskPlanBrowserSafety } from "./mask-plan-safety";

test.use({ serviceWorkers: "block" });

test("new plan after an existing plan stays saveable on phones and immediately supports an update", async ({
  page,
}) => {
  const workspace = maskPlanFixture();
  const writes: { method: string; version?: number }[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/workspace") return route.fulfill({ json: workspace });
    if (url.pathname.startsWith("/api/records/maskPlans")) {
      const payload = route.request().postDataJSON();
      const data = maskPlanSchema.parse(payload.data);
      const method = route.request().method();
      const id = method === "POST" ? "fictional-new-plan" : url.pathname.split("/")[4];
      const previous = workspace.records.maskPlans.find((record) => record.id === id);
      if (previous && payload.version !== previous.version)
        return route.fulfill({ status: 409, json: { error: "Der Eintrag wurde geändert." } });
      writes.push({ method, version: payload.version });
      workspace.records.maskPlans = [
        ...workspace.records.maskPlans.filter((record) => record.id !== id),
        {
          ...(previous || workspace.records.maskPlans[0]),
          id,
          data,
          version: (previous?.version || 0) + 1,
        },
      ];
      return route.fulfill({ json: workspace.records.maskPlans.at(-1) });
    }
    return route.abort();
  });
  await installMaskPlanBrowserSafety(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
  await page.getByRole("button", { name: "Neuer Plan", exact: true }).click();
  await page.getByLabel("Planname", { exact: true }).fill("Fiktiver neuer Ablauf");
  await page.getByRole("button", { name: "Plan anlegen", exact: true }).click();
  await page.getByRole("button", { name: "Personalspalte hinzufügen", exact: true }).click();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await page.getByRole("button", { name: "Zeitblock", exact: true }).click();
  await page.getByRole("checkbox", { name: "Irina K.", exact: true }).check();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  expect(writes).toHaveLength(0);

  const save = page.getByRole("button", { name: "Plan speichern", exact: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(save).toBeEnabled();
    const geometry = await save.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const navigation = document.querySelector(".bottom-nav")!.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        navigationTop: navigation.top,
        exposed: document
          .elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          .some((element) => element === button || button.contains(element)),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.navigationTop);
    expect(geometry.exposed).toBe(true);
    expect(geometry.overflow).toBe(false);
  }
  await save.click();
  await expect(save).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan bearbeiten", exact: true })).toBeVisible();
  expect(writes).toEqual([{ method: "POST", version: undefined }]);
  await page.getByRole("button", { name: /Irina K\..*bearbeiten/ }).click();
  await page.getByLabel("Dauer in Minuten").fill("20");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(save).toBeEnabled();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const desktopSave = page.getByRole("button", { name: "Speichern", exact: true });
  await expect(desktopSave).toBeVisible();
  expect((await desktopSave.boundingBox())!.y).toBeLessThan(900);
  await desktopSave.click();
  await expect(save).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan bearbeiten", exact: true })).toBeVisible();
  expect(writes).toEqual([
    { method: "POST", version: undefined },
    { method: "PATCH", version: 1 },
  ]);
  expect(workspace.records.maskPlans[0].id).toBe("main-plan");
  expect(
    workspace.records.maskPlans.find((record) => record.id === "fictional-new-plan")?.version,
  ).toBe(2);
});
