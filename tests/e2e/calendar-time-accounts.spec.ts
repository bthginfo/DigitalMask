import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  recordKinds,
  type DomainRecord,
  type Member,
  type Workspace,
} from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });
function fixture(): Workspace {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user = {
    id: "planner",
    name: "Leitung",
    username: "planner",
    role: "admin",
    status: "active",
    preferences: { accentPalette: "green", onboardingVersion: 999 },
  };
  const names = [
    "Laura Beispiel",
    "Katharina Beispiel",
    "Janine Beispiel",
    "Julia Gottlöber",
    "Julia John",
    "Magdalena Beispiel",
  ];
  const targets = [39, 39, undefined, 20, 15, 15];
  workspace.members = names.map((name, index): Member => ({
    ...workspace.user,
    id: `person-${index}`,
    name,
    username: `person-${index}`,
    role: "user",
    preferences: {
      accentPalette: "green",
      onboardingVersion: 999,
      ...(targets[index] === undefined
        ? {}
        : {
            workingTime: {
              version: 1,
              openingBalanceSeconds: 0,
              schedules: [
                {
                  effectiveFrom: "2026-10-26",
                  weeklyMinutes: targets[index]! * 60,
                  workingDays: [1, 2, 3, 4, 5, 6],
                },
              ],
            },
          }),
    },
  }));
  workspace.members.push({ ...workspace.user, id: "super", name: "DM.admin", role: "superadmin" });
  for (const kind of recordKinds) workspace.records[kind] = [];
  const row = (
    id: string,
    kind: DomainRecord["kind"],
    data: DomainRecord["data"],
  ): DomainRecord => ({
    id,
    kind,
    data,
    version: 1,
    organizationId: workspace.organization.id,
    departmentId: workspace.department.id,
    createdBy: workspace.user.id,
    createdAt: "2026-10-26T08:00:00Z",
    updatedAt: "2026-10-26T08:00:00Z",
  });
  const hours = [41, 37, 0, 20, 16, 22.75];
  workspace.records.attendance = hours.map((hours, index) =>
    row(`attendance-${index}`, "attendance", {
      userId: `person-${index}`,
      date: "2026-10-26",
      durationSeconds: hours * 3600,
    }),
  );
  workspace.records.attendance.push(
    row("open-week", "attendance", {
      userId: "person-0",
      date: "2026-11-02",
      durationSeconds: 20 * 3600,
    }),
  );
  workspace.records.events = [
    row("planned", "events", {
      category: "service",
      participantIds: ["person-0"],
      title: "Geplanter Dienst",
      start: "2026-11-03T09:00:00+01:00",
      end: "2026-11-03T17:00:00+01:00",
    }),
  ];
  workspace.timer = workspace.attendanceTimer = workspace.live = null;
  return workspace;
}

for (const [width, theme] of [
  [1440, "light"],
  [390, "dark"],
] as const) {
  test(`admin plans with team balances and details at ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-03T12:00:00+01:00"));
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript((theme) => localStorage.setItem("digitalmask-theme", theme), theme);
    const workspace = fixture();
    await page.route("**/api/**", (route) => {
      expect(route.request().method()).toBe("GET");
      if (new URL(route.request().url()).pathname === "/api/workspace") {
        return route.fulfill({ json: workspace });
      }
      return route.fulfill({ json: { ok: true, messages: [] } });
    });
    await page.goto("/?module=calendar", { waitUntil: "domcontentloaded" });
    const panel = page.getByRole("region", { name: "Stundenkonten im Team" });
    await expect(panel).toBeVisible({ timeout: 30000 });
    const toggle = panel.getByRole("button", { name: /Stunden im Team/ });
    await expect(toggle).toHaveAttribute("aria-expanded", width < 761 ? "false" : "true");
    if (width < 761) await toggle.click();
    await expect(panel).toContainText("Saldo bis 01. Nov.");
    await expect(panel.getByRole("button", { name: /^Zeitkonto von Laura/ })).toContainText("+2 h");
    await expect(panel.getByRole("button", { name: /^Zeitkonto von Katharina/ })).toContainText(
      "−2 h",
    );
    await expect(panel).toContainText("Wochenstunden fehlen");
    await expect(panel).not.toContainText("DM.admin");
    await panel.getByLabel("Stundenkonten sortieren").selectOption("balance-desc");
    await expect(panel.locator("li").first()).toContainText("Magdalena");
    await page.getByRole("button", { name: "Team", exact: true }).click();
    const header = page.getByRole("rowheader", { name: "Laura Beispiel", exact: true });
    await expect(header.getByRole("button", { name: /^Zeitkonto von Laura/ })).toContainText(
      "+2 h",
    );
    if (process.env.E2E_ARTIFACTS_DIR)
      await page.screenshot({
        path: `${process.env.E2E_ARTIFACTS_DIR}/calendar-time-accounts-${width}.png`,
        fullPage: true,
      });
    await header.getByRole("button", { name: /^Zeitkonto von Laura/ }).click();
    const dialog = page.getByRole("dialog", { name: "Zeitkonto · Laura Beispiel", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Laufende Woche", exact: true })).toContainText(
      "20 / 39 h",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await toggle.click();
    await expect(header.getByRole("button", { name: /^Zeitkonto von Laura/ })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
test("ordinary members never see colleagues' time accounts in the planner", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T12:00:00+01:00"));
  const workspace = fixture();
  workspace.user = workspace.members[0];
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname === "/api/workspace" ? workspace : { ok: true },
    }),
  );
  await page.goto("/?module=calendar");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("region", { name: "Stundenkonten im Team" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Zeitkonto von/ })).toHaveCount(0);
});
