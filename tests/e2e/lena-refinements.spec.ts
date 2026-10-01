import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type Workspace, type DomainRecord } from "../../src/shared/contracts";
test.use({ serviceWorkers: "block" });
const fixture = JSON.parse(readFileSync("tests/e2e/operations-fixture.json", "utf8"));

async function mock(page: Page, role: "admin" | "user" = "admin") {
  const workspace = structuredClone(fixture) as Workspace;
  workspace.user.role = role;
  for (const kind of recordKinds) workspace.records[kind] = [];
  const row = (
    kind: DomainRecord["kind"],
    id: string,
    data: DomainRecord["data"],
  ): DomainRecord => ({
    kind,
    id,
    data,
    version: 1,
    createdBy: "another-admin",
    organizationId: "qa",
    departmentId: "qa",
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-01T08:00:00Z",
  });
  workspace.records.productions.push(
    row("productions", "play", { title: "Sommernacht", season: "2026/27", status: "active" }),
  );
  for (let index = 0; index < 7; index++)
    workspace.records.events.push(
      row("events", `show-${index}`, {
        title: "Sommernacht",
        category: "performance",
        participantIds: [workspace.user.id],
        start: `2026-10-0${index + 1}T18:00:00Z`,
        end: `2026-10-0${index + 1}T20:00:00Z`,
      }),
    );
  workspace.records.time.push(
    row("time", "old-hours", {
      userId: workspace.user.id,
      date: "2025-09-01",
      durationSeconds: 7200,
    }),
    row("time", "week-hours", {
      userId: workspace.user.id,
      date: "2026-09-30",
      durationSeconds: 3600,
    }),
  );
  workspace.records.attendance.push(
    row("attendance", "attendance", {
      userId: workspace.user.id,
      date: "2026-09-30",
      durationSeconds: 28800,
    }),
  );
  workspace.records.attendance.push(
    row("attendance", "other-person", {
      userId: "qa-user",
      date: "2026-09-30",
      durationSeconds: 36000,
    }),
    row("attendance", "previous-week", {
      userId: workspace.user.id,
      date: "2026-09-26",
      durationSeconds: 36000,
    }),
    row("attendance", "overnight-boundary", {
      userId: workspace.user.id,
      date: "2026-09-27",
      durationSeconds: 5400,
      dayAllocations: [
        { date: "2026-09-27", seconds: 3600 },
        { date: "2026-09-28", seconds: 1800 },
      ],
    }),
  );
  workspace.records.conversations.push(
    row("conversations", "team", { title: "Werkstatt", mode: "team", participantIds: [] }),
  );
  const writes: DomainRecord["data"][] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace") return route.fulfill({ json: workspace });
    if (path === "/api/records/conversations") {
      const body = route.request().postDataJSON().data;
      writes.push(body);
      const record = row("conversations", "new-team", body);
      workspace.records.attendance.push(
        row("attendance", "other-person", {
          userId: "qa-user",
          date: "2026-09-30",
          durationSeconds: 36000,
        }),
        row("attendance", "previous-week", {
          userId: workspace.user.id,
          date: "2026-09-26",
          durationSeconds: 36000,
        }),
        row("attendance", "overnight-boundary", {
          userId: workspace.user.id,
          date: "2026-09-27",
          durationSeconds: 5400,
          dayAllocations: [
            { date: "2026-09-27", seconds: 3600 },
            { date: "2026-09-28", seconds: 1800 },
          ],
        }),
      );
      workspace.records.conversations.push(record);
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { messages: [], ok: true } });
  });
  await page.clock.install({ time: new Date("2026-10-01T10:00:00Z") });
  return { workspace, writes };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
}
for (const width of [1440, 768, 375]) {
  const mobile = width < 760;
  test.describe(mobile ? "mobile" : width === 768 ? "tablet" : "desktop", () => {
    test.use({ viewport: { width, height: mobile ? 812 : 1000 } });
    test("dashboard, current season and public team channel creation", async ({
      page,
    }, testInfo) => {
      const state = await mock(page);
      await page.goto("/");
      await expect(page.locator(".today-summary > button").nth(1)).toContainText("7");
      await expect(page.locator(".today-summary > button").nth(1)).toContainText("Vorstellungen");
      await expect(
        page.getByText("Dein Tag hinter der Bühne. Alles Wichtige an einem Ort.", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".hours-summary strong")).toHaveText("8,5 h");
      await expect(page.locator(".hours-summary")).toContainText("Anwesenheit diese Woche");
      await expect(page.getByRole("button", { name: "Gesamt", exact: true })).toHaveCount(0);
      expect(
        await page
          .locator(".today-notifications")
          .evaluate(
            (element) =>
              !!(
                element.compareDocumentPosition(document.querySelector(".today-layout")!) &
                Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
      ).toBe(true);
      await noOverflow(page);
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.screenshot({ path: testInfo.outputPath("today.png"), fullPage: true });
      if (mobile) {
        const chat = page
          .locator(".bottom-nav")
          .getByRole("button", { name: "Kommunikation", exact: true });
        await expect(chat).toBeVisible();
        const box = await chat.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.goto("/?module=calendar");
      if (mobile) await page.locator(".calendar-filter-toggle").click();
      await expect(page.getByLabel("Spielzeit", { exact: true })).toHaveValue("2026/27");
      await expect(page.locator(".period-picker--compact")).toBeVisible();
      await noOverflow(page);
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.screenshot({ path: testInfo.outputPath("calendar.png"), fullPage: true });
      if (mobile) await page.locator(".calendar-filter-toggle").click();
      await page.goto("/?module=time");
      await expect(page.getByLabel("Spielzeit", { exact: true })).toHaveValue("2026/27");
      await expect(page.getByRole("button", { name: "Offlineentwurf", exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", { name: "Ohne Internet vormerken", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Produktions- / Arbeitszeiten", exact: true }).click();
      await expect(page.getByLabel("Spielzeit", { exact: true })).toHaveValue("2026/27");
      await page.goto("/?module=chat");
      await page.getByRole("button", { name: "Teamkanal", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Teamkanal anlegen" });
      await editor.getByLabel("Kanalname").fill("Dienstplanung");
      await expect(editor.getByText("Teilnehmende", { exact: true })).toHaveCount(0);
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.screenshot({ path: testInfo.outputPath("team-editor.png"), fullPage: true });
      await editor.getByRole("button", { name: "Kanal anlegen", exact: true }).click();
      await expect(editor).not.toBeVisible();
      expect(state.writes.at(-1)).toMatchObject({
        mode: "team",
        title: "Dienstplanung",
        participantIds: [],
      });
      await expect(
        page.locator(".chat-main").getByText("Für das ganze Maskenteam", { exact: false }),
      ).toBeVisible();
      await noOverflow(page);
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.screenshot({ path: testInfo.outputPath("chat.png"), fullPage: true });
      await page.goto("/?module=people");
      await expect(
        page.getByRole("heading", { name: "Ansprechpersonen", exact: true }),
      ).toBeVisible();
    });
  });
}
test("normal members see public team channels but cannot manage them", async ({ page }) => {
  await mock(page, "user");
  await page.goto("/?module=chat&conversationId=team");
  await expect(page.getByRole("button", { name: "Teamkanal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Teamkanal verwalten", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.locator(".chat-main").getByText("Für das ganze Maskenteam", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Privater Chat", exact: true })).toBeVisible();
});
