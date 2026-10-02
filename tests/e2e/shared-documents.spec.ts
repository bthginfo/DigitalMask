import { test, expect, type Browser, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
const mockUrl = process.env.DOCUMENTS_MOCK_URL;
const artifacts = process.env.E2E_ARTIFACTS_DIR;
test.skip(!mockUrl, "Run against the temporary RAM-only documents mock; never against real data.");
async function person(browser: Browser, user: "alex" | "lena", width: number, dark = false) {
  const context = await browser.newContext({
    viewport: { width, height: width < 760 ? 844 : 1000 },
    serviceWorkers: "block",
  });
  await context.addCookies([{ name: "qa-user", value: user, url: mockUrl! }]);
  await context.addInitScript(
    (mode) => localStorage.setItem("digitalmask-theme", mode),
    dark ? "dark" : "light",
  );
  const page = await context.newPage();
  return { context, page };
}
async function capture(page: Page, name: string) {
  if (artifacts) await page.screenshot({ path: `${artifacts}/${name}.png` });
}
async function open(page: Page, name: string) {
  await page.goto(`${mockUrl}/?module=productions&productionId=play&tab=documents`);
  await page
    .getByRole("button", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page.locator(".document-editor-canvas")).toBeVisible();
}

test("Word merges two simultaneous editors, preserves original access and downloads current state", async ({
  browser,
}) => {
  const alex = await person(browser, "alex", 1440),
    lena = await person(browser, "lena", 390, true);
  try {
    await open(alex.page, "Vorbereitung Abschiedsdinner.docx");
    await open(lena.page, "Vorbereitung Abschiedsdinner.docx");
    await expect(alex.page.locator(".shared-text-content")).toContainText("Vor dem Einlass");
    await capture(alex.page, "documents-word-desktop-light");
    await capture(lena.page, "documents-word-mobile-dark");
    const marker = String(Date.now());
    await alex.page.bringToFront();
    await alex.page.locator(".shared-text-content").click();
    await alex.page.keyboard.press("Control+End");
    await alex.page.keyboard.insertText(` Alex ${marker}: Haarschmuck bereit.`);
    await lena.page.bringToFront();
    await lena.page.locator(".shared-text-content").click();
    await lena.page.keyboard.press("Control+End");
    await lena.page.keyboard.insertText(` Lena ${marker}: Perücken bereit.`);
    await expect(lena.page.locator(".document-save-status")).toHaveText("Gespeichert", {
      timeout: 15000,
    });
    await expect(lena.page.locator(".shared-text-content")).toContainText(`Alex ${marker}`, {
      timeout: 15000,
    });
    await alex.page.bringToFront();
    await expect(alex.page.locator(".shared-text-content")).toContainText(`Lena ${marker}`, {
      timeout: 15000,
    });
    await expect(
      alex.page.getByRole("link", { name: "Originaldatei herunterladen", exact: true }),
    ).toHaveAttribute("href", "/api/files/word");
    const downloaded = alex.page.waitForEvent("download");
    await alex.page.getByRole("button", { name: "Herunterladen DOCX", exact: true }).click();
    const stream = await (await downloaded).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const contents = Buffer.concat(chunks).toString();
    expect(contents).toContain(`Alex ${marker}`);
    expect(contents).toContain(`Lena ${marker}`);
    for (const page of [alex.page, lena.page])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
  } finally {
    await alex.context.close();
    await lena.context.close();
  }
});

test("Excel shares independent cell changes, calculates formulas and switches tabs on mobile", async ({
  browser,
}) => {
  const alex = await person(browser, "alex", 1440),
    lena = await person(browser, "lena", 390, false);
  try {
    await open(alex.page, "Dienstplanung.xlsx");
    await open(lena.page, "Dienstplanung.xlsx");
    await alex.page.getByRole("button", { name: /^Zelle B2:/ }).click();
    await alex.page.getByRole("textbox", { name: "Zelle B2 bearbeiten", exact: true }).fill("6");
    await alex.page
      .getByRole("textbox", { name: "Zelle B2 bearbeiten", exact: true })
      .press("Enter");
    await lena.page.getByRole("button", { name: /^Zelle C2:/ }).click();
    await lena.page.getByRole("textbox", { name: "Zelle C2 bearbeiten", exact: true }).fill("8");
    await lena.page
      .getByRole("textbox", { name: "Zelle C2 bearbeiten", exact: true })
      .press("Enter");
    await expect(lena.page.locator(".document-save-status")).toHaveText("Gespeichert", {
      timeout: 15000,
    });
    await lena.page.bringToFront();
    await expect(lena.page.getByRole("button", { name: "Zelle D2: 14", exact: true })).toBeVisible({
      timeout: 15000,
    });
    await alex.page.bringToFront();
    await expect(alex.page.getByRole("button", { name: "Zelle D2: 14", exact: true })).toBeVisible({
      timeout: 15000,
    });
    await capture(alex.page, "documents-sheet-desktop-light");
    await capture(lena.page, "documents-sheet-mobile-light");
    await lena.page.getByRole("button", { name: "Notizen", exact: true }).click();
    await expect(lena.page.getByRole("table", { name: "Notizen", exact: true })).toBeVisible();
    await expect(
      lena.page.getByRole("button", { name: "Zelle A1: Notizen zum Dienst", exact: true }),
    ).toBeVisible();
    await lena.page.getByRole("button", { name: "Dienstplanung", exact: true }).click();
    await lena.page.getByRole("button", { name: "Weitere Zeilen", exact: true }).click();
    await expect(lena.page.getByText("51–80 / 80", { exact: true })).toBeVisible();
    expect(
      await lena.page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  } finally {
    await alex.context.close();
    await lena.context.close();
  }
});

test("PDF supports shared notes and day grid covers 06:00 through the following 01:00", async ({
  browser,
}) => {
  const alex = await person(browser, "alex", 390, true);
  try {
    await open(alex.page, "Probenplan.pdf");
    await alex.page.getByRole("button", { name: "Notiz", exact: true }).click();
    await alex.page
      .getByRole("textbox", { name: /Notiz auf Seite 1/ })
      .last()
      .fill("Bitte den Umbau gemeinsam prüfen.");
    await expect(alex.page.locator(".document-save-status")).toHaveText("Gespeichert", {
      timeout: 15000,
    });
    await capture(alex.page, "documents-pdf-mobile-dark");
    await alex.page.getByRole("button", { name: "Schließen", exact: true }).last().click();
    await alex.page.clock.setFixedTime(new Date("2026-10-02T10:00:00+02:00"));
    await alex.page.goto(`${mockUrl}/?module=calendar`);
    await alex.page.getByRole("button", { name: "Tag", exact: true }).click();
    await expect(alex.page.locator(".fc-timegrid-slot[data-time]").first()).toHaveAttribute(
      "data-time",
      "06:00:00",
    );
    await expect(alex.page.locator(".fc-timegrid-slot[data-time]").last()).toHaveAttribute(
      "data-time",
      "00:30:00",
    );
    await expect(
      alex.page.locator(".fc-timegrid-event").filter({ hasText: "Nachtvorstellung" }),
    ).toBeVisible();
    await capture(alex.page, "calendar-hours-mobile");
  } finally {
    await alex.context.close();
  }
});
