import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type DomainRecord, type Workspace } from "../../src/shared/contracts";
import { shiftDate } from "../../src/shared/client-api";

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
      start: "2026-10-05T12:00:00+02:00",
      end: "2026-10-06T03:00:00+02:00",
      durationSeconds: 15 * 3600,
      dayAllocations: [
        { date: "2026-10-05", seconds: 12 * 3600 },
        { date: "2026-10-06", seconds: 3 * 3600 },
      ],
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
  const day = (id: string, category: string, date = "2026-10-06") =>
    row(id, "events", {
      category,
      allDay: true,
      participantIds: [workspace.user.id],
      start: `${date}T00:00:00+02:00`,
      end: `${shiftDate(date, 1)}T00:00:00+02:00`,
    });
  workspace.records.events = [
    day("holiday", "custom-holiday"),
    day("overlap", "custom-compensation"),
    day("unpaid", "custom-hft"),
    day("absence", "absent", "2026-10-07"),
    day("free", "abf", "2026-10-08"),
    day("future", "vacation", "2026-10-09"),
  ];
  await page.route("**/api/**", (route) => {
    expect(route.request().method()).toBe("GET");
    return new URL(route.request().url()).pathname === "/api/workspace"
      ? route.fulfill({ json: workspace })
      : route.fulfill({ json: { ok: true, messages: [] } });
  });
  await page.goto("/?module=time");
  const account = page.getByRole("region", { name: `Zeitkonto von ${workspace.user.name}` });
  const current = account.getByRole("region", { name: "Laufende Woche", exact: true });
  await expect(current.locator("dl > div").filter({ hasText: "Anwesenheit" })).toContainText(
    "15 h",
  );
  await expect(current.locator("dl > div").filter({ hasText: "Tagesgutschriften" })).toContainText(
    "13,33 h",
  );
  await expect(current.locator("dl > div").filter({ hasText: "Wochensoll" })).toContainText("40 h");
  await expect(current).toContainText("28,33 / 40 h");
  await expect(current).toContainText("Noch 11,67 h bis zum Wochensoll");
  await expect(account).not.toContainText("Minusstunden");
  // One week view: Monday 5 Oct is the first day; days open to their markers and bookings.
  const week = page.getByRole("region", { name: "Anwesenheit: Woche", exact: true });
  const weekDay = (index: number) => week.locator("ol > li").nth(index);
  await expect(week.locator("header")).toContainText("28,33 h");
  await expect(week.locator("header")).toContainText("inkl. 13,33 h Gutschrift");
  const tuesday = weekDay(1);
  await tuesday.locator("summary").click();
  await expect(tuesday.getByRole("button", { name: "Feiertag", exact: true })).toBeVisible();
  await expect(tuesday.getByRole("button", { name: "Feiertagsausgleich" })).toBeVisible();
  await expect(tuesday.getByText("+6,67 h Tagesgutschrift", { exact: true })).toHaveCount(1);
  await expect(tuesday.getByText("3 h", { exact: true })).toBeVisible();
  await expect(weekDay(2)).toContainText("Absent");
  await expect(weekDay(2)).toContainText("6,67 h");
  await expect(weekDay(3)).toContainText("ABF");
  await weekDay(3).locator("summary").click();
  await expect(weekDay(3)).not.toContainText("Tagesgutschrift");
  await expect(weekDay(4)).not.toContainText("Tagesgutschrift");
  await account.getByLabel("Zeitraum des Zeitkontos").selectOption("custom");
  await account.getByLabel("Zeitkonto von", { exact: true }).fill("2026-10-06");
  await account.getByLabel("Zeitkonto bis", { exact: true }).fill("2026-10-06");
  await expect(current.locator("dl > div").filter({ hasText: "Anwesenheit" })).toContainText(
    "15 h",
  );
  await expect(current.locator("dl > div").filter({ hasText: "Tagesgutschriften" })).toContainText(
    "13,33 h",
  );
  await expect(account).toContainText("Der Zeitraum umfasst ganze Kalenderwochen");
  await expect(current).toContainText("Noch 11,67 h bis zum Wochensoll");
  await week.getByLabel("Woche ab", { exact: true }).fill("2026-10-12");
  await week.getByRole("button", { name: "Vorherige Woche", exact: true }).click();
  await expect(week).toContainText("KW 41 · 2026");
  await expect(week.locator("header")).toContainText("28,33 h");
  // Today's saved booking counts in full, separately from four completed 15-hour weeks.
  workspace.user.preferences!.workingTime = {
    version: 1,
    openingBalanceSeconds: 0,
    schedules: [
      { effectiveFrom: "2026-09-14", weeklyMinutes: 15 * 60, workingDays: [1, 2, 3, 4, 5, 6] },
    ],
  };
  workspace.records.events = [];
  workspace.records.attendance = [
    ...[
      ["2026-09-14", 15.5],
      ["2026-09-21", 15.25],
      ["2026-09-28", 17],
      ["2026-10-05", 19],
    ].map(([date, duration]) =>
      row(String(date), "attendance", {
        userId: workspace.user.id,
        title: "Anwesenheit",
        date,
        durationSeconds: Number(duration) * 3600,
      }),
    ),
    row("today-partly-elapsed", "attendance", {
      userId: workspace.user.id,
      title: "Anwesenheit",
      date: "2026-10-12",
      start: "2026-10-12T15:00:00+02:00",
      end: "2026-10-12T21:30:00+02:00",
      durationSeconds: 6.5 * 3600,
      pauseSeconds: 0,
    }),
  ];
  await page.clock.setFixedTime(new Date("2026-10-12T18:00:00+02:00"));
  await page.reload();
  await expect(account).toContainText("Plusstunden gesamt");
  await expect(account).toContainText("+6,75 h");
  await expect(account.locator('dl[aria-label="Berechnung abgeschlossener Wochen"]')).toContainText(
    "66,75 h",
  );
  await expect(account.locator('dl[aria-label="Berechnung abgeschlossener Wochen"]')).toContainText(
    "60 h",
  );
  await expect(current).toContainText("6,5 / 15 h");
  await expect(current).toContainText("Noch 8,5 h bis zum Wochensoll");
  await expect(current.locator("dl > div").filter({ hasText: "Anwesenheit" })).toContainText(
    "6,5 h",
  );
  await account.getByLabel("Zeitraum des Zeitkontos").selectOption("week");
  await account.getByLabel("Woche für Zeitkonto").fill("2026-10-05");
  await expect(account).toContainText("+4 h");
  await expect(account).toContainText("Plusstunden im Zeitraum");
  await expect(current).toHaveCount(0);
  await account.getByLabel("Zeitraum des Zeitkontos").selectOption("month");
  await expect(account).toContainText("+4 h");
  await expect(current).toContainText("6,5 / 15 h");
  await expect(account).toContainText("Ganze Kalenderwochen mit Wochenbeginn in diesem Monat");
  await account.getByText("Wochenübersicht anzeigen", { exact: true }).click();
  await expect(account).toContainText("KW 41 / 2026");
  await expect(account).toContainText("19 h von 15 h");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
