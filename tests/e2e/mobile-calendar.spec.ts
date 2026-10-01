import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type Workspace, type DomainRecord } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });
async function expectMonthFits(page: Page, selector: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const grid = await page.locator(selector).boundingBox();
  const navigation = await page.locator(".bottom-nav").boundingBox();
  expect(grid).not.toBeNull();
  expect(navigation).not.toBeNull();
  // Allow the grid's border and fractional browser rounding at the navigation edge.
  expect(grid!.y + grid!.height).toBeLessThanOrEqual(navigation!.y + 2);
}
async function mock(page: Page, role: "admin" | "user" = "admin", dark = false) {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.role = role;
  workspace.user.name = "Alex Beispiel";
  workspace.members = [
    workspace.user,
    ...["Lena Muster", "Magdalena Beispiel", "Julia Muster", "Nora Beispiel"].map(
      (name, index) => ({
        ...workspace.user,
        id: `member-${index}`,
        name,
        username: `fixture-${index}`,
        role: "user" as const,
      }),
    ),
  ];
  workspace.timer = null;
  workspace.attendanceTimer = null;
  for (const kind of recordKinds) workspace.records[kind] = [];
  const row = (
    kind: DomainRecord["kind"],
    id: string,
    data: DomainRecord["data"],
  ): DomainRecord => ({
    id,
    kind,
    data,
    version: 1,
    createdBy: workspace.user.id,
    organizationId: "qa",
    departmentId: "qa",
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-01T08:00:00Z",
  });
  workspace.records.productions.push(
    row("productions", "play", { title: "Sommernacht", season: "2026/27", status: "active" }),
  );
  workspace.records.events.push(
    row("events", "own", {
      title: "Eigener Dienst",
      category: "service",
      start: "2026-10-01T09:00:00+02:00",
      end: "2026-10-01T15:00:00+02:00",
      participantIds: [workspace.user.id],
    }),
    row("events", "group", {
      title: "Gemeinsame Werkstatt",
      category: "service",
      productionId: "play",
      start: "2026-10-12T09:00:00+02:00",
      end: "2026-10-12T13:00:00+02:00",
      participantIds: ["member-0", "member-1"],
    }),
    row("events", "vacation", {
      title: "",
      category: "vacation",
      allDay: true,
      start: "2026-10-12T00:00:00+02:00",
      end: "2026-10-15T00:00:00+02:00",
      participantIds: ["member-2"],
    }),
    row("events", "overnight", {
      title: "Nachtumbau",
      category: "service",
      start: "2026-10-11T23:00:00+02:00",
      end: "2026-10-12T01:30:00+02:00",
      participantIds: ["member-3"],
    }),
    row("events", "unassigned", {
      title: "Allgemeine Besprechung",
      category: "meeting",
      start: "2026-10-12T14:00:00+02:00",
      end: "2026-10-12T15:00:00+02:00",
      participantIds: [],
    }),
  );
  for (const day of [1, 2, 9, 16, 23, 30]) {
    for (let index = 0; index < 3; index++) {
      workspace.records.events.push(
        row("events", `november-${day}-${index}`, {
          title: `Werkstatt ${index + 1}`,
          category: "service",
          start: `2026-11-${String(day).padStart(2, "0")}T${String(9 + index).padStart(2, "0")}:00:00+01:00`,
          end: `2026-11-${String(day).padStart(2, "0")}T${10 + index}:00:00+01:00`,
          participantIds: [workspace.user.id],
        }),
      );
    }
  }
  let reads = 0;
  const exports: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (url.pathname === "/api/export") {
      exports.push(url.search);
      return route.fulfill({ contentType: "text/csv", body: "Synthetic fixture only" });
    }
    return route.fulfill({ json: { messages: [], ok: true } });
  });
  await page.addInitScript(
    (dark) => localStorage.setItem("digitalmask-theme", dark ? "dark" : "light"),
    dark,
  );
  await page.clock.install({ time: new Date("2026-10-01T10:00:00Z") });
  return { workspace, reads: () => reads, exports };
}
test("mobile day details preserve own-calendar planning and personal selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mock(page, "user");
  await page.goto("/?module=calendar");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("button", { name: "Teammonat", exact: true }).click();
  await page.locator('.team-mobile-calendar [data-date="2026-10-12"]').click();
  await expect(page.locator(".team-mobile-create button")).toHaveCount(1);
  await expect(page.locator(".team-mobile-create button")).toContainText("Alex Beispiel");
  await page
    .locator(".team-mobile-services .team-mobile-service")
    .filter({ hasText: "Gemeinsame Werkstatt" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Bearbeiten", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Schließen", exact: true }).first().click();
  await page.getByRole("button", { name: "Monat", exact: true }).click();
  await page.locator(".calendar-filter-toggle").click();
  await expect(page.locator(".calendar-filters input[type=checkbox]:checked")).toHaveCount(1);
  await page.locator(".calendar-filter-toggle").click();
  await page.getByRole("button", { name: "Nächster Zeitraum", exact: true }).click();
  await expect(page.locator(".personal-mobile-day-detail h3")).toContainText("November");
  expect(state.reads()).toBe(1);
});

for (const width of [320, 375, 390, 768, 1440]) {
  test(`calendar ${width}px ${width === 390 ? "dark" : "light"}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 760 ? 812 : 1000 });
    const state = await mock(page, "admin", width === 390);
    await page.goto("/?module=calendar");
    const mobile = width < 760;
    const toggle = page.locator(".calendar-filter-toggle");
    if (mobile) {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".calendar-filters")).not.toBeVisible();
    }
    await expect(page.locator(".fc-daygrid-body")).toBeVisible();
    if (mobile) await expectMonthFits(page, ".fc-daygrid-body");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({ path: testInfo.outputPath("personal-month.png"), fullPage: true });
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await page.getByRole("button", { name: "Teammonat", exact: true }).click();
    await expect(page.locator(".calendar-navigation h2")).toHaveText("Oktober 2026");
    if (mobile) {
      const region = page.getByRole("region", { name: "Mobiler Teammonatskalender" });
      await expect(region).toBeVisible();
      await expect(region.locator("button[data-date]")).toHaveCount(31);
      await expectMonthFits(page, ".team-mobile-dates");
      await page.screenshot({ path: testInfo.outputPath("team-month-viewport.png") });
      expect(
        await region.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        JSON.stringify(
          await page.evaluate(() =>
            Array.from(document.querySelectorAll(".calendar-module *"))
              .map((element) => ({
                tag: element.tagName,
                class: element.className,
                right: element.getBoundingClientRect().right,
                width: element.getBoundingClientRect().width,
              }))
              .filter((element) => element.right > window.innerWidth + 1)
              .slice(0, 12),
          ),
        ),
      ).toBeLessThanOrEqual(1);
      await region.locator('[data-date="2026-10-12"]').click();
      await expect(region.locator('[data-date="2026-10-12"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(region.locator('[data-date="2026-10-12"]')).toHaveAttribute(
        "aria-label",
        /4 Termine/,
      );
      await expect(page.locator(".team-mobile-services")).toContainText("Lena Muster");
      await expect(page.locator(".team-mobile-services")).toContainText("Magdalena Beispiel");
      await expect(page.locator(".team-mobile-services")).toContainText("Ohne Zuordnung");
      await expect(page.locator(".team-mobile-services")).toContainText("Ganztägig");
      await expect(page.locator(".team-mobile-services .team-mobile-service")).toHaveCount(4);
      await expect(region.locator('[data-date="2026-10-15"]')).toHaveAttribute(
        "aria-label",
        /0 Termine/,
      );
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.screenshot({ path: testInfo.outputPath("team-month.png"), fullPage: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByLabel("Spielzeit", { exact: true })).toHaveValue("2026/27");
      await page.screenshot({ path: testInfo.outputPath("filters.png"), fullPage: true });
      await toggle.click();
    } else {
      await expect(
        page.getByRole("region", { name: "Teammonatskalender", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".team-calendar thead th")).toHaveCount(32);
      await page.screenshot({ path: testInfo.outputPath("team-month.png"), fullPage: true });
    }
    await page.getByRole("button", { name: "Nächster Zeitraum", exact: true }).click();
    await expect(page.locator(".calendar-navigation h2")).toHaveText("November 2026");
    if (mobile) await expectMonthFits(page, ".team-mobile-dates");
    await page.getByRole("button", { name: "Vorheriger Zeitraum", exact: true }).click();
    await expect(page.locator(".calendar-navigation h2")).toHaveText("Oktober 2026");
    expect(state.reads()).toBe(1);
    if (mobile) await page.locator(".calendar-mobile-actions > summary").click();
    await page.getByRole("button", { name: "Exportieren", exact: true }).click();
    const exportDialog = page.getByRole("dialog", { name: "Kalender exportieren" });
    await exportDialog.getByLabel("Format").selectOption("csv");
    await exportDialog.getByRole("button", { name: "Herunterladen", exact: true }).click();
    expect(new URLSearchParams(state.exports.at(-1)).get("view")).toBe("team-month");
    await exportDialog.getByRole("button", { name: "Schließen", exact: true }).last().click();
    if (mobile) {
      await page.getByRole("button", { name: "Monat", exact: true }).click();
      await page.getByRole("button", { name: "Nächster Zeitraum", exact: true }).click();
      await expectMonthFits(page, ".fc-daygrid-body");
      await page.screenshot({ path: testInfo.outputPath("personal-six-week-month.png") });
    }
  });
}
