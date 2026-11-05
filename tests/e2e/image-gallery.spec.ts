import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { DomainRecord, Workspace } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/documents-fixture.json", "utf8"),
  ) as Workspace;
  workspace.live = null;
  workspace.records.notifications = [];
  workspace.records.conversations = [];
  const template = workspace.records.files[0];
  const add = (kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]) => {
    workspace.records[kind].push({ ...template, kind, id, data });
  };
  const file = (
    id: string,
    name: string,
    recordKind: string,
    recordId: string,
    mime = "image/jpeg",
  ) => add("files", id, { name, mime, recordKind, recordId });
  workspace.records.files = [];
  file("look-front", "Vorne.jpg", "looks", "qa-legacy-look");
  file("look-pdf", "Hinweise.pdf", "looks", "qa-legacy-look", "application/pdf");
  file("look-side", "Seite.jpg", "looks", "qa-legacy-look");
  file("look-back", "Hinten.jpg", "looks", "qa-legacy-look");
  file("production-first", "Werkstatt.jpg", "productions", "qa-production");
  file("production-second", "Probenraum.jpg", "productions", "qa-production");
  workspace.records.messages = [];
  add("messages", "chat-photos", { text: "Fotos aus der Probe", userId: workspace.user.id });
  add("messages", "chat-other", { text: "Ein separates Bild", userId: workspace.user.id });
  file("chat-first", "Probe vorne.jpg", "messages", "chat-photos");
  file("chat-second", "Probe hinten.jpg", "messages", "chat-photos");
  file("chat-single", "Separates Bild.jpg", "messages", "chat-other");
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace") return route.fulfill({ json: workspace });
    if (path === "/api/files/look-back") return route.fulfill({ status: 404 });
    if (path.startsWith("/api/files/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="510"><rect width="800" height="510" fill="#bad9d0"/><circle cx="570" cy="195" r="92" fill="#397666"/><path d="M0 450L220 210l190 190 105-103 285 213H0Z" fill="#578b7d"/></svg>',
      });
    return route.fulfill({ json: { ok: true, messages: [], versions: [] } });
  });
}

test("opens the clicked photo, keeps each group separate and preserves keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mock(page);
  await page.goto("/?module=documentation&record=qa-legacy-look", {
    waitUntil: "domcontentloaded",
  });
  const thumbnail = page.getByRole("button", { name: "Seite.jpg vergrößern", exact: true });
  await expect(thumbnail).toBeVisible({ timeout: 30000 });
  await thumbnail.click();
  const gallery = page.getByRole("dialog", { name: "Bildergalerie", exact: true });
  await expect(gallery.getByRole("img", { name: "Seite.jpg", exact: true })).toBeVisible();
  await expect(gallery).toContainText("Bild 2 von 3");
  if (process.env.E2E_ARTIFACTS_DIR)
    await gallery.screenshot({
      path: `${process.env.E2E_ARTIFACTS_DIR}/image-gallery-desktop.png`,
    });
  await gallery.getByRole("button", { name: "Nächstes Bild", exact: true }).click();
  await expect(gallery).toContainText("Dieses Bild konnte nicht geladen werden.");
  await page.keyboard.press("ArrowRight");
  await expect(gallery.getByRole("img", { name: "Vorne.jpg", exact: true })).toBeVisible();
  await expect(gallery).toContainText("Bild 1 von 3");
  await page.keyboard.press("ArrowLeft");
  await expect(gallery).toContainText("Bild 3 von 3");
  await page.keyboard.press("Escape");
  await expect(gallery).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
  await expect(page.getByRole("button", { name: "Hinweise.pdf", exact: true })).toHaveAttribute(
    "title",
    "Gemeinsam öffnen und bearbeiten",
  );

  await page.goto("/?module=productions&productionId=qa-production&tab=documents", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Probenraum.jpg", exact: true }).click({ timeout: 30000 });
  await expect(gallery).toContainText("Bild 2 von 2");
  await gallery.getByRole("button", { name: "Vorheriges Bild", exact: true }).click();
  await expect(gallery.getByRole("img", { name: "Werkstatt.jpg", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/?module=chat", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Probe vorne.jpg", exact: true })
    .click({ timeout: 30000 });
  await expect(gallery).toContainText("Bild 1 von 2");
  await gallery.getByRole("button", { name: "Nächstes Bild", exact: true }).click();
  await expect(gallery.getByRole("img", { name: "Probe hinten.jpg", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Separates Bild.jpg", exact: true }).click();
  await expect(gallery.getByRole("img", { name: "Separates Bild.jpg", exact: true })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Nächstes Bild", exact: true })).toHaveCount(0);
});

test.describe("mobile gallery", () => {
  test("swipes to the next photo in a fitted touch viewer", async ({ playwright, baseURL }) => {
    const browser = await playwright.webkit.launch();
    try {
      const page = await browser.newPage({
        baseURL,
        serviceWorkers: "block",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      await page.addInitScript(() => localStorage.setItem("digitalmask-theme", "dark"));
      await mock(page);
      await page.goto("/?module=documentation&record=qa-legacy-look", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("button", { name: "Vorne.jpg vergrößern", exact: true })
        .tap({ timeout: 30000 });
      const gallery = page.getByRole("dialog", { name: "Bildergalerie", exact: true });
      await expect(gallery.getByRole("img", { name: "Vorne.jpg", exact: true })).toBeVisible();
      await gallery.getByRole("group", { name: "Bildvorschau" }).evaluate((stage) => {
        const bounds = stage.getBoundingClientRect();
        const touch = (x: number) => ({ clientX: x, clientY: bounds.top + bounds.height / 2 });
        const start = touch(bounds.right - 45);
        const end = touch(bounds.left + 45);
        for (const [type, touches, changed] of [
          ["touchstart", [start], start],
          ["touchend", [], end],
        ] as const) {
          const event = new Event(type, { bubbles: true });
          Object.defineProperties(event, {
            touches: { value: touches },
            changedTouches: { value: [changed] },
          });
          stage.dispatchEvent(event);
        }
      });
      await expect(gallery).toContainText("Bild 2 von 3");
      await expect(gallery.getByRole("img", { name: "Seite.jpg", exact: true })).toBeVisible();
      expect((await gallery.boundingBox())!.width).toBeLessThanOrEqual(390);
      expect((await gallery.boundingBox())!.height).toBeLessThanOrEqual(844);
      if (process.env.E2E_ARTIFACTS_DIR)
        await gallery.screenshot({
          path: `${process.env.E2E_ARTIFACTS_DIR}/image-gallery-mobile.png`,
        });
      await gallery.getByRole("button", { name: "Schließen", exact: true }).tap();
      await expect(
        page.getByRole("button", { name: "Vorne.jpg vergrößern", exact: true }),
      ).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
