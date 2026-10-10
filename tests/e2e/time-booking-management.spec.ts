import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type DomainRecord, type Workspace } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });

for (const kind of ["attendance", "time"] as const) {
  test(`${kind}: a member can correct and delete their own historical booking`, async ({
    page,
  }) => {
    await page.setViewportSize(
      kind === "attendance" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
    const workspace = JSON.parse(
      readFileSync("tests/e2e/operations-fixture.json", "utf8"),
    ) as Workspace;
    workspace.user.preferences = { accentPalette: "green", onboardingVersion: 999 };
    workspace.user.role = "user";
    workspace.live = null;
    workspace.timer = workspace.attendanceTimer = null;
    for (const recordKind of recordKinds) workspace.records[recordKind] ||= [];
    workspace.records.time = workspace.records.attendance = workspace.records.timesheets = [];
    const booking = {
      id: `synthetic-${kind}`,
      kind,
      data: {
        userId: workspace.user.id,
        title: kind === "attendance" ? "Anwesenheit Test" : "Perücke vorbereiten Test",
        date: "2026-09-28",
        start: "2026-09-28T07:00:00Z",
        end: "2026-09-28T15:00:00Z",
        durationSeconds: 27000,
        pauseSeconds: 1800,
        category: "other",
        dayAllocations: [{ date: "2026-09-28", seconds: 27000 }],
      },
      version: 1,
      createdBy: workspace.user.id,
      organizationId: "test",
      departmentId: "test",
      createdAt: "2026-09-28T15:00:00Z",
      updatedAt: "2026-09-28T15:00:00Z",
    } as DomainRecord;
    workspace.records.categories.push({
      ...booking,
      id: "synthetic-time-category",
      kind: "categories",
      data: { scope: "time", key: "other", name: "Sonstiges", color: "#77818e", order: 0 },
    });
    workspace.records[kind] = [booking];
    let updates = 0;
    let deletions = 0;
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/workspace") return route.fulfill({ json: workspace });
      if (url.pathname === `/api/records/${kind}/${booking.id}`) {
        if (request.method() === "PATCH") {
          const { data, version } = request.postDataJSON();
          expect(version).toBe(1);
          expect(data.pauseSeconds).toBe(900);
          expect(data.durationSeconds).toBe(27900);
          booking.data = {
            ...booking.data,
            ...data,
            dayAllocations: [{ date: data.date, seconds: data.durationSeconds }],
          };
          booking.version++;
          updates++;
          return route.fulfill({ json: booking });
        }
        if (request.method() === "DELETE") {
          expect(url.searchParams.get("version")).toBe("2");
          deletions++;
          if (deletions === 1)
            return route.fulfill({
              status: 503,
              json: { error: "Bitte erneut versuchen. Die Buchung wurde noch nicht gelöscht." },
            });
          workspace.records[kind] = [];
          return route.fulfill({ json: { ok: true } });
        }
      }
      return route.fulfill({ json: { ok: true, messages: [] } });
    });
    await page.goto("/?module=time");
    if (kind === "time")
      await page.getByRole("button", { name: "Produktionsstunden", exact: true }).click();
    const history = page.getByRole("region", {
      name: `${kind === "attendance" ? "Anwesenheit" : "Arbeitszeit"}: Wochenverlauf`,
    });
    await history.locator("summary").filter({ hasText: "KW 40 · 2026" }).click();
    const row = history.getByRole("listitem").filter({ hasText: String(booking.data.title) });
    await expect(row.getByRole("button", { name: "Bearbeiten", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Löschen", exact: true })).toBeVisible();
    const targets = await row
      .locator(".button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(targets.every((height) => height >= 44)).toBe(true);
    await row.getByRole("button", { name: "Bearbeiten", exact: true }).click();
    const editor = page.getByRole("dialog", {
      name: kind === "attendance" ? "Anwesenheit bearbeiten" : "Zeitbuchung bearbeiten",
      exact: true,
    });
    await editor.getByLabel("Pause in Minuten", { exact: true }).fill("15");
    await editor.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(updates).toBe(1);
    await expect(row).toContainText("7,75 h");
    await row.getByRole("button", { name: "Löschen", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: kind === "attendance" ? "Anwesenheit löschen" : "Produktionsstunden löschen",
      exact: true,
    });
    await confirmation.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(deletions).toBe(0);
    // Also cover the same action inside the editor with a nested confirmation.
    if (kind === "attendance") {
      await row.getByRole("button", { name: "Bearbeiten", exact: true }).click();
      await editor.getByRole("button", { name: "Löschen", exact: true }).click();
      await confirmation.getByRole("button", { name: "Schließen", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(editor).toBeVisible();
      expect(updates).toBe(1);
      expect(deletions).toBe(0);
      await editor.getByRole("button", { name: "Löschen", exact: true }).click();
    } else await row.getByRole("button", { name: "Löschen", exact: true }).click();
    await confirmation.getByRole("button", { name: "Endgültig löschen", exact: true }).click();
    await expect(confirmation.getByRole("alert")).toContainText("Bitte erneut versuchen");
    expect(workspace.records[kind]).toHaveLength(1);
    await confirmation.getByRole("button", { name: "Endgültig löschen", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toHaveCount(0);
    expect(deletions).toBe(2);
    expect(workspace.records[kind]).toHaveLength(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
}
