import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type DomainRecord, type Workspace } from "../../src/shared/contracts";

test.use({ serviceWorkers: "block" });

for (const kind of ["attendance", "time"] as const) {
  test(`${kind}: a lost response keeps the input and a retry confirms the same booking`, async ({
    page,
  }) => {
    const workspace = JSON.parse(
      readFileSync("tests/e2e/operations-fixture.json", "utf8"),
    ) as Workspace;
    workspace.user.preferences = { accentPalette: "green", onboardingVersion: 999 };
    workspace.user.role = kind === "attendance" ? "admin" : "user";
    workspace.live = null;
    workspace.timer = workspace.attendanceTimer = null;
    for (const recordKind of recordKinds) workspace.records[recordKind] ||= [];
    workspace.records[kind] = [];
    workspace.records.timesheets = [];
    const receipts: string[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/workspace") return route.fulfill({ json: workspace });
      if (path === `/api/records/${kind}`) {
        const { data } = route.request().postDataJSON();
        receipts.push(data.idempotencyKey);
        let saved = workspace.records[kind].find(
          (row) => row.data.idempotencyKey === data.idempotencyKey,
        );
        if (!saved) {
          saved = {
            id: `synthetic-${kind}`,
            kind,
            data: { ...data, userId: workspace.user.id },
            createdBy: workspace.user.id,
            organizationId: "test",
            departmentId: "test",
            version: 1,
            createdAt: "2026-10-08T09:00:00Z",
            updatedAt: "2026-10-08T09:00:00Z",
          } as DomainRecord;
          workspace.records[kind].push(saved);
        }
        // Simulate a committed write whose response never reaches the browser.
        if (receipts.length === 1) return route.abort("failed");
        return route.fulfill({ status: 201, json: saved });
      }
      return route.fulfill({ json: { ok: true, messages: [] } });
    });
    await page.goto("/?module=time");
    if (kind === "time")
      await page.getByRole("button", { name: "Produktionsstunden", exact: true }).click();
    await page.getByRole("button", { name: "Nachtragen", exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (kind === "time") {
      await dialog.getByLabel("Tätigkeit", { exact: true }).fill("Tagesdienst");
      await dialog.getByLabel("Beginn & Ende", { exact: true }).check();
    }
    await dialog.getByLabel("Beginn", { exact: true }).fill("2026-09-14T09:30");
    await dialog.getByLabel("Ende", { exact: true }).fill("2026-09-14T17:00");
    await dialog.getByLabel("Pause in Minuten", { exact: true }).fill("30");
    await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Keine Antwort vom Server erhalten");
    await expect(dialog.getByRole("alert")).toContainText("in diesem Browser gesichert");
    await expect(dialog.getByLabel("Beginn", { exact: true })).toHaveValue("2026-09-14T09:30");
    const key = `digitalmask-${kind}-drafts:${workspace.user.id}`;
    const drafts = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), key);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(receipts[0]);
    await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatch(/^manual:/);
    expect(receipts[1]).toBe(receipts[0]);
    expect(workspace.records[kind]).toHaveLength(1);
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), key),
    ).toEqual([]);
  });
}
