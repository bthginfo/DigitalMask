import { expect, test } from "@playwright/test";
import { productionOverviewReference } from "../../src/shared/production-overview";
import { productionMakeupChoiceFixture } from "./production-makeup-choice-fixture";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1365]) {
  test(`production overview includes unassigned productions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const workspace = productionMakeupChoiceFixture();
    const own = workspace.records.productions[0];
    const other = {
      ...own,
      id: "other-production",
      data: {
        ...own.data,
        title: "Unzugeordnetes Stück",
        description: "Produktionsinfos für das ganze Team.",
        memberIds: ["lena"],
        contacts: [
          { id: "lead", role: "Maskenbetreuung", type: "makeup", name: "", memberId: "lena" },
        ],
      },
    };
    workspace.productionOverview = [own, other].map(productionOverviewReference);
    let writes = 0;
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET") writes++;
      return route.fulfill({
        json:
          new URL(route.request().url()).pathname === "/api/workspace" ? workspace : { ok: true },
      });
    });
    await page.goto("/?module=productions");
    const card = page.getByRole("button", { name: /Unzugeordnetes Stück/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Lena");
    await expect(card).toContainText("Produktionsinfos ansehen");
    await expect(card).not.toContainText("0 offene Aufgaben");
    await expect(page.getByRole("button", { name: /Der Bär/ })).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { name: other.data.title, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Maskenbetreuung" })).toContainText("Lena");
    await expect(page.getByText(other.data.description, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Produktion verwalten" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Projektchat", exact: true })).toHaveCount(0);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (process.env.E2E_ARTIFACTS_DIR)
      await page.screenshot({
        path: `${process.env.E2E_ARTIFACTS_DIR}/production-overview-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("button", { name: "Alle Produktionen", exact: true }).click();
    await expect(card).toBeVisible();
    expect(writes).toBe(0);
  });
}
