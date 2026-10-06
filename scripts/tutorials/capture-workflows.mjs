import { chromium } from "@playwright/test";
import { join, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { workflows } from "./workflows.mjs";

const root = resolve(".");
const work = join(root, ".local", "tutorial-workflows");
mkdirSync(work, { recursive: true });
const url = process.env.TUTORIAL_BASE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Recordings require localhost");
const selected = process.argv.slice(2);
const flows = selected.length ? workflows.filter((flow) => selected.includes(flow.id)) : workflows;
if (!flows.length || (selected.length && flows.length !== selected.length))
  throw new Error("Unknown tutorial ID");
const browser = await chromium.launch({ headless: true });
const init = ["demo-init.js", "workflow-demo.js"]
  .map((file) => readFileSync(join(root, "scripts", "tutorials", file), "utf8"))
  .join("\n");
try {
  for (const flow of flows) {
    const directory = join(work, flow.id);
    mkdirSync(directory, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 640, height: 900 },
      recordVideo: { dir: directory, size: { width: 640, height: 900 } },
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      colorScheme: "light",
      serviceWorkers: "block",
    });
    await context.addInitScript({
      content:
        init + (flow.emptyCasting ? "\nwindow.__DM_DEMO.workspace.records.casting = [];" : ""),
    });
    await context.route("**/api/**", (route) => {
      if (
        route.request().method() === "GET" &&
        new URL(route.request().url()).pathname.startsWith("/api/files/demo-file-")
      )
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: readFileSync(join(work, "reference.png")),
        });
      return route.abort();
    });
    const recordingStart = performance.now();
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const video = page.video();
    const stages = [];
    let started;
    const hold = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    async function point(locator) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) throw new Error("Hidden tutorial target");
      await page.evaluate(({ x, y }) => window.__dmMove(x, y, 480), {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
      await hold(120);
    }
    const click = async (locator) => {
      await point(locator);
      await locator.click();
      await hold(280);
    };
    const fill = async (locator, text) => {
      await point(locator);
      if (await locator.evaluate((element) => element.tagName === "SELECT"))
        await locator.selectOption(text);
      else await locator.fill(text);
      await hold(480);
    };
    const stage = (title, text) => {
      stages.push({
        at: (performance.now() - started) / 1000,
        step: stages.length + 1,
        title,
        text,
      });
      console.log(`${flow.id}: ${title}`);
    };
    try {
      const query = flow.module
        ? `module=${flow.module}`
        : `module=productions&productionId=demo-production&tab=${flow.tab}`;
      await page.goto(`${url}/?${query}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator(".workspace").waitFor();
      await hold(800);
      if (!(await page.evaluate(() => Boolean(window.__DM_DEMO))))
        throw new Error("Missing fictional workspace");
      started = performance.now();
      const recordingOffset = (started - recordingStart) / 1000;
      await flow.run({ page, click, fill, stage, hold, image: join(work, "reference.png") });
      await page.evaluate(() => {
        const cursor = document.getElementById("dm-demo-cursor");
        if (cursor) cursor.style.opacity = "0";
      });
      await hold(500);
      const duration = (performance.now() - started) / 1000;
      writeFileSync(
        join(directory, "timeline.json"),
        JSON.stringify(
          {
            ...Object.fromEntries(Object.entries(flow).filter(([key]) => key !== "run")),
            duration,
            recordingOffset,
            stages,
          },
          null,
          2,
        ),
      );
      await context.close();
      await video.saveAs(join(directory, "raw.webm"));
      console.log(JSON.stringify({ id: flow.id, duration }));
    } catch (error) {
      console.error(
        await page
          .locator("main")
          .innerText()
          .catch(() => "Main not available"),
      );
      await context.close();
      throw error;
    }
  }
} finally {
  await browser.close();
}
