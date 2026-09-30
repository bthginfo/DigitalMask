import { test as base, expect, chromium, webkit, type Page } from "@playwright/test";
import { recordKinds, type Workspace } from "../../src/shared/contracts";

const dummyPassword = "Dummy-Visibility-Only-2026";
const test = base.extend<{ engine: "chromium" | "webkit"; uiPage: Page }>({
  engine: ["chromium", { option: true }],
  uiPage: async ({ engine, baseURL, viewport, hasTouch }, runWithPage) => {
    const browser = await (engine === "webkit" ? webkit : chromium).launch();
    const context = await browser.newContext({
      baseURL,
      viewport: viewport || undefined,
      hasTouch,
      serviceWorkers: "block",
    });
    try {
      await runWithPage(await context.newPage());
    } finally {
      await browser.close();
    }
  },
});

async function verifyVisibility(page: Page, label: string, touch: boolean) {
  const input = page.getByLabel(label, { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  await input.fill(dummyPassword);
  const show = page.getByRole("button", { name: `${label} anzeigen`, exact: true });
  await expect(show).toBeEnabled();
  await expect(show).toHaveAttribute("type", "button");
  await expect(show).toHaveAttribute("aria-controls", (await input.getAttribute("id"))!);
  await expect(show).toHaveAttribute("aria-pressed", "false");
  const hitArea = await show.boundingBox();
  expect(hitArea!.width).toBeGreaterThanOrEqual(44);
  expect(hitArea!.height).toBeGreaterThanOrEqual(44);
  if (touch) await show.tap();
  else await show.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue(dummyPassword);
  const hide = page.getByRole("button", { name: `${label} verbergen`, exact: true });
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  if (touch) await hide.tap();
  else await hide.click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue(dummyPassword);

  // Keyboard activation must not submit the surrounding authentication form.
  await show.focus();
  await show.press("Space");
  await expect(input).toHaveAttribute("type", "text");
  await hide.press("Enter");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue(dummyPassword);

  // Password managers can populate the DOM without firing React change events.
  await input.evaluate((element) => {
    (element as HTMLInputElement).value = "Dummy-Autofill-Only-2026";
  });
  await show.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue("Dummy-Autofill-Only-2026");
  await hide.click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue("Dummy-Autofill-Only-2026");
}

for (const browserName of ["chromium", "webkit"] as const) {
  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 1000 }, hasTouch: false },
    { name: "mobile", viewport: { width: 390, height: 844 }, hasTouch: true },
  ]) {
    test.describe(`password visibility · ${browserName} · ${device.name}`, () => {
      test.use({ engine: browserName, viewport: device.viewport, hasTouch: device.hasTouch });

      for (const route of ["login", "register"]) {
        test(`${route} preserves typed/autofilled values for pointer and keyboard toggles`, async ({
          uiPage: page,
        }) => {
          const submissions: string[] = [];
          page.on("request", (request) => {
            if (request.method() === "POST" && /\/api\/(login|register)$/.test(request.url()))
              submissions.push(request.url());
          });
          await page.goto(`/${route}`);
          await verifyVisibility(page, "Passwort", device.hasTouch);
          await expect(page).toHaveURL(new RegExp(`/${route}$`));
          expect(submissions).toEqual([]);
        });
      }

      test("password recovery toggles each field independently without submitting", async ({
        uiPage: page,
      }) => {
        await page.goto("/login");
        await page
          .getByRole("button", { name: "Passwort mit Code zurücksetzen", exact: true })
          .click();
        await verifyVisibility(page, "Neues Passwort", device.hasTouch);
        await expect(
          page.getByLabel("Neues Passwort wiederholen", { exact: true }),
        ).toHaveAttribute("type", "password");
        await verifyVisibility(page, "Neues Passwort wiederholen", device.hasTouch);
        await expect(page.getByRole("dialog")).toBeVisible();
      });

      test("personal settings use the same accessible password control", async ({
        uiPage: page,
      }) => {
        const user: Workspace["user"] = {
          id: "visibility-test-user",
          name: "UI Test",
          username: "visibility-test",
          role: "user",
          status: "active",
        };
        const workspace: Workspace = {
          user,
          organization: { id: "ui-test", name: "UI Test" },
          department: { id: "ui-test", name: "Maske" },
          members: [user],
          records: Object.fromEntries(
            recordKinds.map((kind) => [kind, []]),
          ) as unknown as Workspace["records"],
          projectHours: {},
          timer: null,
        };
        await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
        await page.goto("/?module=settings");
        await verifyVisibility(page, "Aktuelles Passwort", device.hasTouch);
        await verifyVisibility(page, "Neues Passwort", device.hasTouch);
        await verifyVisibility(page, "Neues Passwort wiederholen", device.hasTouch);
      });
    });
  }
}
