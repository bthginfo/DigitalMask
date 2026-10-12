import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type DomainRecord, type Workspace } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });

test("personal calendar credits appear separately in the mobile time account and period views", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00+02:00"));
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.role = "user";
  workspace.user.preferences = {
    accentPalette: "green",
    onboardingVersion: 999,
    workingTime: {
      version: 1,
      openingBalanceSeconds: 0,
      schedules: [
        { effectiveFrom: "2026-10-05", weeklyMinutes: 40 * 60, workingDays: [1, 2, 3, 4, 5, 6] },
      ],
    },
  };
  workspace.live = null;
  workspace.timer = workspace.attendanceTimer = null;
  for (const kind of recordKinds) workspace.records[kind] ||= [];
  const row = (
    id: string,
    kind: DomainRecord["kind"],
    data: DomainRecord["data"],
  ): DomainRecord => ({
    id,
    kind,
    data,
    version: 1,
    organizationId: "synthetic",
    departmentId: "synthetic",
    createdBy: workspace.user.id,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
  });
  workspace.records.time = workspace.records.timesheets = workspace.records.leave = [];
  workspace.records.attendance = [
    row("attendance", "attendance", {
      userId: workspace.user.id,
      title: "Anwesenheit",
      date: "2026-10-05",
      durationSeconds: 15 * 3600,
    }),
  ];
  workspace.records.calendarCategories = [
    row("holiday-type", "calendarCategories", {
      key: "custom-holiday",
      name: "Feiertag",
      allDay: true,
      color: "#377a68",
    }),
    row("compensation-type", "calendarCategories", {
      key: "custom-compensation",
      name: "Feiertagsausgleich",
      allDay: true,
      color: "#377a68",
    }),
    row("unpaid-type", "calendarCategories", {
      key: "custom-hft",
      name: "HFT",
      allDay: true,
      color: "#377a68",
    }),
  ];
  const day = (id: string, category: string) =>
    row(id, "events", {
      category,
      allDay: true,
      participantIds: [workspace.user.id],
      start: "2026-10-05T22:00:00Z",
      end: "2026-10-06T22:00:00Z",
    });
  workspace.records.events = [
    day("holiday", "custom-holiday"),
    day("overlap", "custom-compensation"),
    day("unpaid", "custom-hft"),
  ];
  await page.route("**/api/**", (route) => {
    expect(route.request().method()).toBe("GET");
    return new URL(route.request().url()).pathname === "/api/workspace"
      ? route.fulfill({ json: workspace })
      : route.fulfill({ json: { ok: true, messages: [] } });
  });
  await page.goto("/?module=time");
  const account = page.getByRole("region", { name: `Zeitkonto von ${workspace.user.name}` });
  await expect(account.locator("dl > div").filter({ hasText: "Anwesenheit" })).toContainText(
    "15 h",
  );
  await expect(account.locator("dl > div").filter({ hasText: "Tagesgutschriften" })).toContainText(
    "6,67 h",
  );
  await expect(account.locator("dl > div").filter({ hasText: "Sollzeit" })).toContainText("20 h");
  await expect(account).toContainText("+1,67 h");
  await account.getByLabel("Zeitraum des Zeitkontos").selectOption("custom");
  await account.getByLabel("Zeitkonto von", { exact: true }).fill("2026-10-06");
  await account.getByLabel("Zeitkonto bis", { exact: true }).fill("2026-10-06");
  await expect(account.locator("dl > div").filter({ hasText: "Anwesenheit" })).toContainText("0 h");
  await expect(account.locator("dl > div").filter({ hasText: "Tagesgutschriften" })).toContainText(
    "6,67 h",
  );
  await expect(account).toContainText("Ausgeglichen im Zeitraum");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
