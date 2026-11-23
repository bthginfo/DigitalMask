import { expect, test, type Page } from "@playwright/test";
import { maskPlanFixture } from "./mask-plans-fixture";
import { installMaskPlanBrowserSafety } from "./mask-plan-safety";
import type { DomainRecord } from "../../src/shared/contracts";

async function setup(page: Page) {
  const workspace = maskPlanFixture();
  function add(kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]) {
    workspace.records[kind].push({ ...workspace.records.productions[0], kind, id, data });
  }
  add("events", "series", {
    productionId: "bear",
    title: "Sonntagsvorstellung",
    category: "performance",
    participantIds: ["jules"],
    start: "2026-09-27T08:50:00Z",
    end: "2026-09-27T10:00:00Z",
    recurrence: "weekly",
    until: "2026-10-31",
  });
  for (const id of ["vorne", "hinten", "privat"]) {
    add("messages", id, {
      text: `Foto ${id}`,
      userId: "jules",
      ...(id === "privat" ? { conversationId: "private" } : { productionId: "bear" }),
    });
    add("files", `file-${id}`, {
      name: `${id}.jpg`,
      mime: "image/jpeg",
      recordKind: "messages",
      recordId: id,
    });
  }
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace") return route.fulfill({ json: workspace });
    if (path.startsWith("/api/files/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
      });
    return route.fulfill({ json: { ok: true, messages: [] } });
  });
  await installMaskPlanBrowserSafety(page);
}

for (const mobile of [true, false]) {
  test.describe(mobile ? "Smartphone" : "Desktop", () => {
    test.use({
      viewport: { width: mobile ? 390 : 1366, height: mobile ? 844 : 900 },
      serviceWorkers: "block",
    });
    test("stage links keep the selected occurrence and show personal assignments", async ({
      page,
    }) => {
      await setup(page);
      await page.goto("/?module=calendar");
      if (mobile) {
        await page.locator('[data-calendar-day="2026-10-04"]').click();
        await page.locator("dialog[data-calendar-day-sheet] .team-mobile-service").first().click();
      } else
        await page
          .locator('.fc-daygrid-day[data-date="2026-10-04"] .fc-daygrid-event')
          .first()
          .click();
      const shortcuts = page.getByRole("navigation", { name: "Für diesen Termin" });
      const plan = shortcuts.getByRole("link", { name: "Maskenplan" });
      expect(
        new URL((await plan.getAttribute("href")) || "", "http://localhost").searchParams.get(
          "showStart",
        ),
      ).toBe("2026-10-04T08:50:00.000Z");
      await expect(shortcuts.getByRole("link", { name: "Umzugsliste" })).toHaveAttribute(
        "href",
        /tab=backstage-changes/,
      );
      await plan.click();
      await expect(page.getByLabel("Vorstellungsbeginn (optional)", { exact: true })).toHaveValue(
        "10:50",
      );
      await page.getByText("Wer ist als Nächstes dran?", { exact: true }).click();
      const run = page.locator("details[open]").filter({ has: page.getByLabel("Maskenplatz") });
      await expect(run.getByLabel("Vorstellungstag")).toHaveValue("2026-10-04");
      await expect(run.getByLabel("Maskenplatz")).toHaveValue("mine");
      await expect(run).toContainText("Irina K.");
      await expect(run).toContainText("Ben E.");
      await expect(run).not.toContainText("Gastbesetzung");
      await run.getByLabel("Maskenplatz").selectOption("all");
      await expect(run).toContainText("Gastbesetzung");
    });
    test("chat media spans messages and jumps to the selected source", async ({ page }) => {
      await setup(page);
      await page.goto("/?module=productions&productionId=bear&tab=chat");
      if (mobile) await page.getByRole("button", { name: "Chataktionen" }).click();
      await page.getByRole("button", { name: "Medien & Dateien", exact: true }).click();
      const media = page.getByRole("dialog", { name: "Medien & Dateien" });
      await expect(media.getByText("privat.jpg", { exact: true })).toHaveCount(0);
      await media.getByRole("button", { name: "vorne.jpg vergrößern" }).click();
      const gallery = page.getByRole("dialog", { name: "Bildergalerie" });
      await expect(gallery).toContainText("von 2");
      await gallery.getByRole("button", { name: "Nächstes Bild" }).click();
      await expect(gallery).toContainText("hinten.jpg");
      await gallery.getByRole("button", { name: "Schließen" }).click();
      await media.getByRole("button", { name: "Zur Nachricht mit hinten.jpg" }).click();
      await expect(page.locator("article.notification-target")).toContainText("Foto hinten");
      await expect(page).toHaveURL(/tab=chat.*messageId=hinten/);
    });
  });
}
