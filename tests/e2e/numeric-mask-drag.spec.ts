import { expect, test, type Page } from "@playwright/test";
import type { DomainRecord, RecordData, RecordKind } from "../../src/shared/contracts";
import type { MaskPlanData } from "../../src/modules/mask-plans/model";
import { blockIds, laneIds } from "./mask-plans-fixture";
import { numericMaskFixture } from "./numeric-mask-fixture";
import { installMaskPlanBrowserSafety } from "./mask-plan-safety";

test.use({
  serviceWorkers: "block",
  browserName: process.env.E2E_TOUCH_ENGINE === "webkit" ? "webkit" : "chromium",
});
const maskUrl = "/?module=productions&productionId=bear&tab=mask-plan&record=main-plan";
const boardName = "Maskenplan-Zeittabelle, horizontal und vertikal scrollbar";
const artifacts = process.env.E2E_ARTIFACTS_DIR;
async function capture(page: Page, name: string) {
  if (artifacts)
    await page.screenshot({ path: `${artifacts}/numeric-mask-${name}.png`, fullPage: true });
}
async function mock(page: Page, extended = false, dark = false) {
  const workspace = numericMaskFixture(extended);
  const writes: { kind: RecordKind; data: RecordData; version?: number }[] = [];
  let reads = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (path.startsWith("/api/records/")) {
      const kind = path.split("/")[3] as RecordKind,
        payload = request.postDataJSON();
      const id = path.split("/")[4] || `new-${writes.length}`;
      const original = workspace.records[kind].find((row) => row.id === id);
      writes.push({ kind, ...payload });
      if (original && payload.version !== original.version)
        return route.fulfill({ status: 409, json: { error: "Der Eintrag wurde geändert." } });
      const record: DomainRecord = {
        ...workspace.records.productions[0],
        ...original,
        kind,
        id,
        data: payload.data,
        version: (original?.version || 0) + 1,
      };
      workspace.records[kind] = [...workspace.records[kind].filter((row) => row.id !== id), record];
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await installMaskPlanBrowserSafety(page, dark);
  return { workspace, writes, reads: () => reads };
}

test("minute drafts clear, reject blanks, keep discard guards and apply real numbers", async ({
  page,
}) => {
  const fixture = await mock(page);
  await page.goto(maskUrl);
  await page.getByLabel("Planoptionen", { exact: true }).click();
  await page.getByRole("button", { name: "Name & Vorlauf", exact: true }).click();
  const lead = page.getByLabel("Vorlauf in Minuten");
  await lead.fill("");
  await expect(lead).toHaveValue("");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Name & Vorlauf" })).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await lead.fill("60");
  await lead.press("End");
  await lead.press("Backspace");
  await expect(lead).toHaveValue("6");
  await lead.fill("90");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  const block = page.locator(`[data-mask-block="${blockIds[0]}"]`);
  await block.click();
  const start = page.getByLabel("Minuten vor Beginn", { exact: true }),
    duration = page.getByLabel("Dauer in Minuten", { exact: true });
  await start.fill("");
  await duration.fill("");
  await expect(start).toHaveValue("");
  await expect(duration).toHaveValue("");
  await expect(page.getByText("Bitte Zeit und Dauer eintragen.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Zeitblock bearbeiten" })).toBeVisible();
  const confirm = page.waitForEvent("dialog");
  const closing = page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect((await confirm).message()).toContain("verwerfen");
  await (await confirm).dismiss();
  await closing;
  await start.fill("70");
  await duration.fill("30");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  const saved = fixture.writes[0].data as MaskPlanData;
  expect(saved.windowMinutes).toBe(90);
  expect(saved.blocks[0]).toMatchObject({ startMinutes: -70, durationMinutes: 30 });
});

test("stock, optional zero, category, template, year and booked minutes retain editable drafts", async ({
  page,
}) => {
  const fixture = await mock(page);
  await page.goto("/?module=inventory");
  await page.getByRole("button", { name: "Material anlegen", exact: true }).click();
  await page.getByLabel("Bezeichnung").fill("Neue Pinsel");
  await page.getByLabel("Lagerort").fill("Schrank B");
  await page.getByLabel("Bestand", { exact: false }).first().fill("");
  await expect(page.getByLabel("Bestand", { exact: false }).first()).toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByLabel("Bestand", { exact: false }).first().fill("2.5");
  await page.getByLabel("Mindestbestand", { exact: true }).fill("");
  await expect(page.getByLabel("Mindestbestand", { exact: true })).toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.writes[0].data).toMatchObject({ quantity: 2.5, minQuantity: 0 });
  await page.getByRole("button", { name: "Kategorien verwalten", exact: true }).click();
  await page.getByRole("button", { name: "Werkzeuge bearbeiten", exact: true }).click();
  await page.getByLabel("Reihenfolge").fill("");
  await expect(page.getByLabel("Reihenfolge")).toHaveValue("");
  await page.getByLabel("Reihenfolge").fill("12");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Funduskategorien verwalten" })).toBeVisible();
  expect(fixture.writes[1].data.order).toBe(12);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.goto("/?module=documentation");
  const year = page.getByLabel("Jahr", { exact: true });
  await year.fill("202");
  await expect(year).toHaveValue("202");
  await year.fill("2026");
  await expect(year).toHaveValue("2026");
  await year.fill("");
  await expect(year).toHaveValue("");
  await page.getByRole("button", { name: "Vorlagen", exact: true }).click();
  await page.getByRole("button", { name: "Vorlage anlegen", exact: true }).click();
  await page.getByLabel("Vorlagenname").fill("Neue Vorlage");
  await page.getByLabel("Vorlagenversion").fill("");
  await expect(page.getByLabel("Vorlagenversion")).toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  expect(fixture.writes).toHaveLength(2);
  await page.getByLabel("Vorlagenversion").fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.writes[2].data.version).toBe(3);
  await page.goto("/?module=time");
  await page.getByRole("button", { name: "Produktions- / Arbeitszeiten", exact: true }).click();
  await page.getByRole("button", { name: "Zeit nachtragen", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Tätigkeit", { exact: true }).fill("Pinsel einrichten");
  await page.getByLabel("Dauer in Minuten").fill("");
  await page.getByLabel("Pause in Minuten").fill("");
  await expect(page.getByLabel("Dauer in Minuten")).toHaveValue("");
  await expect(page.getByLabel("Pause in Minuten")).toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  expect(fixture.writes).toHaveLength(3);
  await page.getByLabel("Dauer in Minuten").fill("75");
  await page.getByLabel("Pause in Minuten").fill("10");
  expect(fixture.writes).toHaveLength(3);
  await capture(page, "number-form-desktop-light");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.writes[3].data).toMatchObject({ durationSeconds: 4500, pauseSeconds: 600 });
});

async function dropPoint(page: Page, laneId: string, minutes: number) {
  return page.getByRole("region", { name: boardName }).evaluate(
    (board, { laneId, minutes }) => {
      const lane = board.querySelector<HTMLElement>(`[data-mask-lane="${laneId}"]`)!;
      const rect = lane.getBoundingClientRect(),
        viewport = board.getBoundingClientRect();
      return {
        x: Math.max(viewport.left + 110, rect.left + Math.min(90, rect.width / 2)),
        y: rect.top + (minutes + 120) * 8.8,
      };
    },
    { laneId, minutes },
  );
}

test("new block drops at a scrolled later lane, moving preserves content and stays local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 1050 });
  const fixture = await mock(page, true);
  await page.goto(maskUrl);
  await page.getByRole("button", { name: "Plan bearbeiten", exact: true }).click();
  const board = page.getByRole("region", { name: boardName });
  await board.scrollIntoViewIfNeeded();
  await board.evaluate((element) => {
    element.scrollLeft = 420;
    element.scrollTop = 450;
  });
  const control = page.getByRole("button", { name: "Zeitblock platzieren", exact: true });
  const from = (await control.boundingBox())!;
  const target = await dropPoint(page, laneIds[2], -40);
  const reads = fixture.reads();
  await page.mouse.move(from.x + 30, from.y + 22);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Zeitblock hinzufügen" })).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: /^Personalspalte/ }),
  ).toHaveValue(laneIds[2]);
  await expect(page.getByLabel("Minuten vor Beginn", { exact: true })).toHaveValue("40");
  await expect(page.getByLabel("Dauer in Minuten")).toHaveValue("15");
  await page.getByLabel("Tätigkeit / Zusatz (optional)").fill("Neuer Wechsel");
  await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.reads()).toBe(reads);
  await board.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 400;
  });
  const existing = page.locator(`[data-mask-block="${blockIds[1]}"]`);
  const source = (await existing.boundingBox())!;
  const destination = await dropPoint(page, laneIds[1], -35);
  await page.mouse.move(source.x + 30, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(existing).toHaveAttribute("aria-label", /-35 Minuten vor Beginn, 10 Minuten/);
  await expect(existing.locator("..")).toHaveAttribute("data-mask-lane", laneIds[1]);
  expect(fixture.writes).toHaveLength(0);
  await capture(page, "dragged-desktop-light");
  await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
  const original = fixture.writes[0].data as MaskPlanData;
  expect(original.blocks.find((block) => block.id === blockIds[1])).toMatchObject({
    laneId: laneIds[1],
    startMinutes: -35,
    durationMinutes: 10,
    actorIds: ["ben", "michael"],
    title: "Letzte Kontrolle",
    color: "#bfaee0",
  });
});

test("a workspace update during a drag keeps the original version and reports a conflict", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await mock(page, true);
  await page.goto(maskUrl);
  await page.getByRole("button", { name: "Plan bearbeiten", exact: true }).click();
  const board = page.getByRole("region", { name: boardName });
  await board.scrollIntoViewIfNeeded();
  await board.evaluate((element) => {
    element.scrollTop = 400;
  });
  const source = (await page.locator(`[data-mask-block="${blockIds[1]}"]`).boundingBox())!;
  const destination = await dropPoint(page, laneIds[1], -35);
  await page.mouse.move(source.x + 30, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + 10);
  await expect(page.locator("[class*=dragGhost]")).toBeVisible();
  fixture.workspace.records.maskPlans[0].version = 2;
  fixture.workspace.records.maskPlans[0].data.title = "Aktueller Plan der Kollegin";
  (fixture.workspace.records.maskPlans[0].data as MaskPlanData).blocks[1].title =
    "Änderung der Kollegin";
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).evaluate((button) => {
    // The active drag suppresses native clicks. Run the existing refresh callback,
    // as the workspace live-event subscription does in the background.
    const props = Object.keys(button).find((key) => key.startsWith("__reactProps$"))!;
    return (button as unknown as Record<string, { onClick: () => unknown }>)[props].onClick();
  });
  await expect(
    page.getByRole("heading", { name: "Aktueller Plan der Kollegin", exact: true }),
  ).toBeVisible();
  await page.mouse.move(destination.x, destination.y + 10, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole("region", { name: "Maskenpläne dieser Produktion" }).getByRole("alert"),
  ).toContainText("inzwischen geändert");
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeDisabled();
  expect(fixture.writes).toHaveLength(0);
  expect((fixture.workspace.records.maskPlans[0].data as MaskPlanData).blocks[1].title).toBe(
    "Änderung der Kollegin",
  );
});

test("mobile short tap edits; long hold moves, clamps at zero, and scrolling or cancellation makes no edit", async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const fixture = await mock(page, true, true);
  await page.goto(maskUrl);
  await page.getByRole("button", { name: "Plan bearbeiten", exact: true }).click();
  const board = page.getByRole("region", { name: boardName });
  await board.scrollIntoViewIfNeeded();
  await board.evaluate((element) => {
    element.scrollTop = 450;
  });
  const block = page.locator(`[data-mask-block="${blockIds[1]}"]`);
  await block.tap();
  await expect(page.getByRole("dialog", { name: "Zeitblock bearbeiten" })).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  const cdp = browserName === "chromium" ? await context.newCDPSession(page) : null;
  const touch = async (
    type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
    x?: number,
    y?: number,
  ) =>
    cdp
      ? cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: x === undefined ? [] : [{ x, y: y!, id: 1 }],
        })
      : page.evaluate(
          ({ type, x, y }) => {
            const state = window as unknown as { qaTouchTarget?: Element | null };
            if (type === "touchStart") state.qaTouchTarget = document.elementFromPoint(x!, y!);
            const target = state.qaTouchTarget || document;
            const event = new Event(type.toLowerCase(), { bubbles: true, cancelable: true });
            const points =
              x === undefined ? [] : [{ clientX: x, clientY: y, identifier: 1, target }];
            Object.defineProperties(event, {
              touches: { value: points },
              changedTouches: { value: points },
            });
            target.dispatchEvent(event);
          },
          { type, x, y },
        );
  let rect = (await block.boundingBox())!;
  const before = await board.evaluate((element) => element.scrollTop);
  await touch("touchStart", rect.x + 30, rect.y + 15);
  await touch("touchMove", rect.x + 30, rect.y - 70);
  await touch("touchEnd");
  // WebKit has no CDP touch injector; its DOM sensor path is exercised above,
  // while native touch scrolling is covered by the Chromium branch.
  if (browserName === "webkit")
    await board.evaluate((element) => {
      element.scrollTop -= 80;
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeDisabled();
  const afterScroll = await board.evaluate((element) => element.scrollTop);
  if (browserName === "webkit") expect(afterScroll).toBeLessThan(before);
  else expect(afterScroll).toBeGreaterThan(before);
  await board.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 450;
  });
  rect = (await block.boundingBox())!;
  await touch("touchStart", rect.x + 30, rect.y + 10);
  await expect(page.locator("[class*=dragGhost]")).toBeVisible();
  await touch("touchMove", 10, 20);
  await touch("touchCancel");
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeDisabled();
  await board.evaluate((element) => {
    element.scrollTop = 450;
  });
  rect = (await block.boundingBox())!;
  await touch("touchStart", rect.x + 30, rect.y + 10);
  await expect(page.locator("[class*=dragGhost]")).toBeVisible();
  await board.evaluate((element) => {
    element.scrollLeft = 215;
    element.scrollTop = 700;
  });
  const target = await dropPoint(page, laneIds[1], -5);
  await touch("touchMove", target.x, target.y + 10);
  await touch("touchEnd");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(block).toHaveAttribute("aria-label", /-10 Minuten vor Beginn, 10 Minuten/);
  await expect(block.locator("..")).toHaveAttribute("data-mask-lane", laneIds[1]);
  await expect(page.getByRole("button", { name: "Plan speichern", exact: true })).toBeEnabled();
  expect(fixture.writes).toHaveLength(0);
  await capture(page, "held-mobile-dark");
  await block.tap();
  await expect(page.getByRole("dialog", { name: "Zeitblock bearbeiten" })).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.getByRole("button", { name: "Zeitblock platzieren", exact: true }).tap();
  await board.scrollIntoViewIfNeeded();
  await board.evaluate((element) => {
    element.scrollLeft = 215;
    element.scrollTop = 700;
  });
  const place = await dropPoint(page, laneIds[1], -25);
  await page.touchscreen.tap(place.x, place.y);
  await expect(page.getByRole("dialog", { name: "Zeitblock hinzufügen" })).toBeVisible();
  await expect(page.getByLabel("Minuten vor Beginn", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await context.close();
});
