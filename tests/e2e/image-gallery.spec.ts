import { expect, test, type Locator, type Page } from "@playwright/test";
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
  const zoom = gallery.getByRole("button", { name: /^Bild einpassen/ });
  await gallery.getByRole("button", { name: "Bild vergrößern", exact: true }).click();
  await expect(zoom).toHaveText("150 %");
  await gallery.getByRole("group", { name: /^Bildvorschau/ }).press("ArrowDown");
  await expect(gallery.getByRole("img", { name: "Seite.jpg" })).toHaveCSS(
    "transform",
    "matrix(1.5, 0, 0, 1.5, 0, -48)",
  );
  await zoom.click();
  await expect(zoom).toHaveText("100 %");
  if (process.env.E2E_ARTIFACTS_DIR)
    await gallery.screenshot({
      path: `${process.env.E2E_ARTIFACTS_DIR}/image-gallery-desktop.png`,
    });
  const nextPicture = gallery.getByRole("button", { name: "Nächstes Bild", exact: true });
  await nextPicture.click();
  await expect(gallery).toContainText("Dieses Bild konnte nicht geladen werden.");
  await expect(nextPicture).toBeFocused();
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

type TouchPoint = { id: number; x: number; y: number };

function webkitGesture(stage: Locator, start: TouchPoint[], end: TouchPoint[]) {
  return stage.evaluate(
    (area, { start, end }) => {
      // WebKit's test driver exposes taps. Dispatch the multi-pointer sequence on the stage.
      const capture = area.setPointerCapture;
      area.setPointerCapture = () => {};
      try {
        for (const [type, points] of [
          ["pointerdown", start],
          ["pointermove", end],
          ["pointerup", end],
        ] as const)
          for (const { id, x, y } of points)
            area.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                pointerType: "touch",
                pointerId: id,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            );
      } finally {
        area.setPointerCapture = capture;
      }
    },
    { start, end },
  );
}

for (const engine of ["chromium", "webkit"] as const) {
  test(`keeps chat photos zoomed after a pinch and pans before swiping (${engine})`, async ({
    playwright,
    baseURL,
  }) => {
    const browser = await playwright[engine].launch();
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
      await page.goto("/?module=chat", { waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: "Probe vorne.jpg", exact: true })
        .tap({ timeout: 30000 });
      const gallery = page.getByRole("dialog", { name: "Bildergalerie", exact: true });
      const photo = gallery.getByRole("img", { name: "Probe vorne.jpg", exact: true });
      await expect(photo).toBeVisible();
      const stage = gallery.getByRole("group", { name: /^Bildvorschau/ });
      const bounds = (await stage.boundingBox())!;
      const centerX = Math.round(bounds.x + bounds.width / 2);
      const centerY = Math.round(bounds.y + bounds.height / 2);
      const point = (id: number, offset: number) => ({ id, x: centerX + offset, y: centerY });
      const cdp = engine === "chromium" ? await page.context().newCDPSession(page) : null;
      const touch = async (start: TouchPoint[], end: TouchPoint[]) => {
        if (!cdp) return webkitGesture(stage, start, end);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: start });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: end });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      const originalScale = await page.evaluate(() => window.visualViewport?.scale);
      await touch([point(1, -40), point(2, 40)], [point(1, -110), point(2, 110)]);
      const zoom = gallery.getByRole("button", { name: /^Bild einpassen/ });
      await expect(zoom).toHaveText("275 %");
      const beforePan = await photo.evaluate((image) => getComputedStyle(image).transform);
      await touch([point(1, 65)], [point(1, -65)]);
      await expect(photo).not.toHaveCSS("transform", beforePan);
      await expect(zoom).toHaveText("275 %");
      await expect(gallery).toContainText("Bild 1 von 2");
      expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(originalScale);
      expect((await gallery.boundingBox())!.width).toBeLessThanOrEqual(390);
      expect((await gallery.boundingBox())!.height).toBeLessThanOrEqual(844);
      if (process.env.E2E_ARTIFACTS_DIR && engine === "webkit")
        await gallery.screenshot({
          path: `${process.env.E2E_ARTIFACTS_DIR}/image-gallery-mobile.png`,
        });
      // Chromium's synthetic pinch and drag suppress the next emulated tap even on plain HTML.
      if (cdp) await zoom.click();
      else await zoom.tap();
      await expect(zoom).toHaveText("100 %");
      await touch([point(1, 65)], [point(1, -65)]);
      await expect(gallery).toContainText("Bild 2 von 2");
      await expect(
        gallery.getByRole("img", { name: "Probe hinten.jpg", exact: true }),
      ).toBeVisible();
      await expect(zoom).toHaveText("100 %");
      for (let tap = 0; tap < 2; tap++) await touch([point(1, 30)], [point(1, 30)]);
      await expect(zoom).toHaveText("250 %");
      const close = gallery.getByRole("button", { name: "Schließen", exact: true });
      if (cdp) await close.click();
      else await close.tap();
      await expect(
        page.getByRole("button", { name: "Probe vorne.jpg", exact: true }),
      ).toBeVisible();
    } finally {
      await browser.close();
    }
  });
}
