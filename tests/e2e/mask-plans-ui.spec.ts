import { expect, test, type Page } from "@playwright/test";
import type { DomainRecord, RecordData } from "../../src/shared/contracts";
import { maskPlanFixture } from "./mask-plans-fixture";
import { installMaskPlanBrowserSafety } from "./mask-plan-safety";

test.use({ serviceWorkers: "block" });
const artifacts = process.env.E2E_ARTIFACTS_DIR;
async function capture(page: Page, name: string) {
  if (artifacts) await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
}
async function mock(page: Page, dark = false, empty = false) {
  const workspace = maskPlanFixture();
  if (empty) workspace.records.maskPlans = [];
  const writes: { method: string; id: string; version?: number; data: RecordData }[] = [];
  let reads = 0;
  let failure = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (url.pathname.startsWith("/api/records/maskPlans")) {
      const id = url.pathname.split("/")[4] || `new-${writes.length}`;
      const payload = method === "DELETE" ? {} : route.request().postDataJSON();
      writes.push({ method, id, ...payload });
      if (failure)
        return route.fulfill({ status: failure, json: { error: "Fiktiver Speicherfehler." } });
      const previous = workspace.records.maskPlans.find((record) => record.id === id);
      if (method === "DELETE") {
        workspace.records.maskPlans = workspace.records.maskPlans.filter(
          (record) => record.id !== id,
        );
        return route.fulfill({ json: { ok: true } });
      }
      if (previous && previous.version !== payload.version)
        return route.fulfill({ status: 409, json: { error: "Der Eintrag wurde geändert." } });
      const record: DomainRecord = {
        ...(previous || workspace.records.productions[0]),
        kind: "maskPlans",
        id,
        data: payload.data,
        version: (previous?.version || 0) + 1,
      };
      workspace.records.maskPlans = [
        ...workspace.records.maskPlans.filter((row) => row.id !== id),
        record,
      ];
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await installMaskPlanBrowserSafety(page, dark);
  return {
    workspace,
    writes,
    reads: () => reads,
    fail: (status: number) => {
      failure = status;
    },
  };
}

for (const state of [
  { width: 1440, dark: false },
  { width: 1440, dark: true },
  { width: 375, dark: false },
  { width: 375, dark: true },
  { width: 390, dark: false },
  { width: 390, dark: true },
]) {
  test(`compact saved timetable ${state.width}px ${state.dark ? "dark" : "light"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: state.width, height: state.width < 500 ? 844 : 1080 });
    const fixture = await mock(page, state.dark);
    await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
    await expect(page.getByRole("heading", { name: "Maskenplan", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Plan bearbeiten", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Liste", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tabelle", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Zeitblock platzieren", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Personalspalte bearbeiten: Jules / Janine" }),
    ).toBeVisible();
    await page.getByLabel("Vorstellungsbeginn (optional)").fill("19:30");
    const board = page.getByRole("region", {
      name: "Maskenplan-Zeittabelle, horizontal und vertikal scrollbar",
    });
    await expect(board).toHaveAttribute("data-compact", "true");
    await expect(board.getByText("18:30", { exact: true }).first()).toBeVisible();
    expect(
      await board
        .locator("[data-mask-block]")
        .evaluateAll((blocks) =>
          blocks.every((block) => block.scrollHeight <= block.clientHeight + 1),
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const timeRail = board.locator("[class*=timeRail]");
    const before = (await timeRail.boundingBox())!.x;
    await board.evaluate((element) => {
      element.scrollLeft = 180;
    });
    expect((await timeRail.boundingBox())!.x).toBeCloseTo(before, 0);
    await board.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await capture(page, `mask-table-${state.width}-${state.dark ? "dark" : "light"}`);
    const reads = fixture.reads();
    await expect(page.getByRole("link", { name: "Irina K." })).toBeVisible();
    await expect(board.locator("[data-mask-zero]")).toContainText("0");
    await page.getByRole("button", { name: "Exportieren", exact: true }).click();
    await expect(page.getByRole("link", { name: "PDF · drucken" })).toHaveAttribute(
      "href",
      /performanceTime=19%3A30/,
    );
    expect(fixture.writes).toHaveLength(0);
    expect(fixture.reads()).toBe(reads);
  });
}

test("new plan uses shared staff, cast actors and one explicit write", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mock(page, true, true);
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan");
  await page.getByRole("button", { name: "Maskenplan anlegen", exact: true }).click();
  await page.getByLabel("Planname", { exact: true }).fill("Premiere");
  await page.getByRole("button", { name: "Plan anlegen", exact: true }).click();
  await page.getByRole("button", { name: "Personalspalte hinzufügen", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Jules", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Janine", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "DM.admin" })).toHaveCount(0);
  await page.getByLabel("Spaltenname (optional)").fill("Gemeinsam");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await page.getByRole("button", { name: "Zeitblock", exact: true }).first().click();
  await expect(
    page.getByRole("checkbox", { name: "Ein Gast aus einer anderen Produktion" }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Ben E.", exact: true }).check();
  await page.getByRole("checkbox", { name: "Michael A.", exact: true }).check();
  await page.getByLabel("Minuten vor Beginn").fill("20");
  await page.getByLabel("Dauer in Minuten").fill("30");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "endet nach dem Vorstellungsbeginn",
  );
  await page.getByLabel("Dauer in Minuten").fill("20");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Exportieren", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan bearbeiten", exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].method).toBe("POST");
  const saved = fixture.workspace.records.maskPlans[0].data;
  expect(saved.title).toBe("Premiere");
  expect((saved.lanes as { memberIds: string[] }[])[0].memberIds).toEqual(["jules", "janine"]);
  expect(
    (saved.blocks as { actorIds: string[]; startMinutes: number; durationMinutes: number }[])[0],
  ).toMatchObject({ actorIds: ["ben", "michael"], startMinutes: -20, durationMinutes: 20 });
  await capture(page, "mask-created-mobile-dark");
});

test("failed save and a version conflict keep the full editable draft until a successful separate save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const fixture = await mock(page);
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
  const board = page.getByRole("region", {
    name: "Maskenplan-Zeittabelle, horizontal und vertikal scrollbar",
  });
  await page.getByRole("button", { name: "Plan bearbeiten", exact: true }).click();
  await page.getByRole("button", { name: /Irina K\..*bearbeiten/ }).click();
  await page.getByLabel("Hinweise (optional)").fill("Mein vollständiger fiktiver Entwurf.");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  fixture.fail(500);
  const save = page.getByRole("button", { name: "Plan speichern", exact: true });
  await save.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Fiktiver Speicherfehler" }),
  ).toBeVisible();
  await expect(board).toHaveAttribute("data-compact", "false");
  await expect(save).toBeEnabled();
  expect(fixture.workspace.records.maskPlans[0].data.blocks).not.toEqual(
    fixture.writes[0].data.blocks,
  );
  fixture.fail(0);
  fixture.workspace.records.maskPlans[0].version = 2;
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: "inzwischen geändert" })).toBeVisible();
  await expect(board).toHaveAttribute("data-compact", "false");
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Als neuen Plan behalten", exact: true }).click();
  await save.click();
  await expect(board).toHaveAttribute("data-compact", "true");
  await expect(save).toHaveCount(0);
  const copy = fixture.workspace.records.maskPlans.find((record) => record.id.startsWith("new-"))!;
  expect((copy.data.blocks as { notes: string }[])[0].notes).toBe(
    "Mein vollständiger fiktiver Entwurf.",
  );
  expect(
    fixture.workspace.records.maskPlans.find((record) => record.id === "main-plan")?.version,
  ).toBe(2);
});

test("compact table keeps long names, notes, links and horizontal rails accessible without mode reads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mock(page, true);
  const longName = "Fiktive Darstellerin mit einem besonders langen Doppelnamen";
  fixture.workspace.records.actors[0].data.name = longName;
  const plan = fixture.workspace.records.maskPlans[0]
    .data as unknown as import("../../src/modules/mask-plans/model").MaskPlanData;
  plan.lanes[0].staffNames.push("Fiktive Aushilfe mit einem langen vollständigen Namen");
  plan.blocks[0].notes =
    "Lange fiktive Hinweise: " + "Perücke und Haarnadeln sorgfältig bereitlegen. ".repeat(15);
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
  const board = page.getByRole("region", {
    name: "Maskenplan-Zeittabelle, horizontal und vertikal scrollbar",
  });
  await expect(page.getByRole("link", { name: longName, exact: true })).toBeVisible();
  await expect(board).toHaveAttribute("data-compact", "true");
  const reads = fixture.reads();
  await page.getByRole("button", { name: "Plan bearbeiten", exact: true }).click();
  await expect(board).toHaveAttribute("data-compact", "false");
  await page.getByRole("button", { name: "Bearbeiten beenden", exact: true }).click();
  await expect(board).toHaveAttribute("data-compact", "true");
  await page.getByRole("button", { name: new RegExp(`${longName}.*bearbeiten`) }).click();
  await expect(page.getByLabel("Hinweise (optional)")).toHaveValue(plan.blocks[0].notes);
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("button", { name: "Bearbeiten beenden", exact: true }).click();
  await page.getByLabel("Vorstellungsbeginn (optional)").fill("19:30");
  expect(fixture.reads()).toBe(reads);
  expect(fixture.writes).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test("dirty edits survive refresh and stale version offers a separate plan", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await mock(page);
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
  await page.getByLabel("Planoptionen", { exact: true }).click();
  await page.getByRole("button", { name: "Name & Vorlauf", exact: true }).click();
  await page.getByLabel("Planname", { exact: true }).fill("Mein lokaler Plan");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  const dialog = page.waitForEvent("dialog");
  const change = page.getByLabel("Plan auswählen").selectOption("rehearsal-plan");
  await (await dialog).dismiss();
  await change;
  await expect(page.getByRole("heading", { name: "Mein lokaler Plan", exact: true })).toBeVisible();
  fixture.workspace.records.maskPlans[0].version = 2;
  fixture.workspace.records.maskPlans[0].data.title = "Plan der Kollegin";
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Maskenpläne dieser Produktion" }).getByRole("alert"),
  ).toContainText("inzwischen geändert");
  await expect(page.getByRole("heading", { name: "Mein lokaler Plan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeDisabled();
  await capture(page, "mask-conflict-desktop-light");
  await page.getByRole("button", { name: "Als neuen Plan behalten", exact: true }).click();
  await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].method).toBe("POST");
  expect(
    fixture.workspace.records.maskPlans.find((record) => record.id === "main-plan")?.data.title,
  ).toBe("Plan der Kollegin");
  const original = fixture.workspace.records.maskPlans.find((record) => record.id === "main-plan")!;
  const copy = fixture.workspace.records.maskPlans.find((record) => record.id.startsWith("new-"))!;
  expect((copy.data.lanes as { id: string }[])[0].id).not.toBe(
    (original.data.lanes as { id: string }[])[0].id,
  );
});

test("refresh during an open form keeps its original version", async ({ page }) => {
  const fixture = await mock(page);
  await page.goto("/?module=productions&productionId=bear&tab=mask-plan&record=main-plan");
  await page.getByLabel("Planoptionen", { exact: true }).click();
  await page.getByRole("button", { name: "Name & Vorlauf", exact: true }).click();
  await page.getByLabel("Planname", { exact: true }).fill("Mein erster Entwurf");
  fixture.workspace.records.maskPlans[0].version = 2;
  fixture.workspace.records.maskPlans[0].data.title = "Neuer Stand der Kollegin";
  // Simulate the same workspace refresh triggered by live events, behind the native dialog.
  await page
    .getByRole("button", { name: "Erneut versuchen", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByLabel("Planname", { exact: true })).toHaveValue("Mein erster Entwurf");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Maskenpläne dieser Produktion" }).getByRole("alert"),
  ).toContainText("inzwischen geändert");
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeDisabled();
  expect(fixture.writes).toHaveLength(0);
});
