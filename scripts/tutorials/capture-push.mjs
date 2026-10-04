import { chromium } from "@playwright/test";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const root = resolve(".");
const work = join(root, ".local", "tutorial-release");
mkdirSync(join(work, "recordings"), { recursive: true });
const url = process.env.TUTORIAL_BASE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Tutorial recordings must use the local application.");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 640, height: 900 },
  recordVideo: { dir: join(work, "recordings"), size: { width: 640, height: 900 } },
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
  colorScheme: "light",
  serviceWorkers: "block",
});
await context.addInitScript({ path: join(root, "scripts", "tutorials", "demo-init.js") });
await context.addInitScript({ path: join(root, "scripts", "tutorials", "push-demo.js") });
await context.route("**/api/**", (route) => route.abort());
const recordingStart = performance.now();
const page = await context.newPage();
const video = page.video();
const stages = [];
let started;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function stage(step, title, text) {
  stages.push({ at: (performance.now() - started) / 1000, step, title, text });
  console.log(title);
}
async function click(locator) {
  await locator.scrollIntoViewIfNeeded();
  const r = await locator.boundingBox();
  await page.evaluate(({ x, y }) => window.__dmMove(x, y, 650), {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });
  await pause(180);
  await locator.click();
}
try {
  await page.goto(url + "/?module=today", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Guten Morgen, Mara." }).waitFor();
  if (!(await page.evaluate(() => Boolean(window.__DM_DEMO))))
    throw new Error("Missing fictional workspace");
  started = performance.now();
  const recordingOffset = (started - recordingStart) / 1000;
  stage(0, "Mitteilungen einschalten", "Öffne zuerst die installierte App und melde dich an.");
  await pause(2400);
  stage(1, "Einstellungen öffnen", "Tippe unten auf Mehr und dann auf Einstellungen.");
  await click(page.getByRole("button", { name: "Mehr", exact: true }));
  await pause(900);
  await click(page.getByRole("button", { name: "Einstellungen", exact: true }));
  await pause(900);
  await page
    .getByRole("heading", { name: "Mitteilungen auf diesem Gerät", exact: true })
    .evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await pause(1300);
  stage(
    2,
    "Mitteilungen aktivieren",
    "Wähle Mitteilungen aktivieren. Du entscheidest für jedes Handy einzeln.",
  );
  await click(page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }));
  await pause(1100);
  stage(
    3,
    "Erlaubnis geben",
    "Tippe bei der Nachfrage deines Handys auf Erlauben. Hier vereinfacht gezeigt.",
  );
  await pause(2300);
  await click(page.getByRole("button", { name: "Erlauben", exact: true }));
  await page.getByText("Mitteilungen sind auf diesem Gerät aktiviert.", { exact: true }).waitFor();
  await pause(1700);
  stage(
    4,
    "Empfang prüfen",
    "Tippe auf Testmitteilung und prüfe die Mitteilungen auf deinem Handy.",
  );
  await click(page.getByRole("button", { name: "Testmitteilung", exact: true }));
  await page
    .getByText("Die Testmitteilung wurde gesendet. Prüfe die Mitteilungen auf deinem Gerät.", {
      exact: true,
    })
    .waitFor();
  await pause(1700);
  stage(5, "Fertig", "Kein Empfang? Prüfe die Handy-Einstellungen und den Fokusmodus.");
  await page.evaluate(() => {
    const cursor = document.getElementById("dm-demo-cursor");
    if (cursor) cursor.style.opacity = "0";
  });
  await pause(4000);
  const duration = (performance.now() - started) / 1000;
  const requests = await page.evaluate(() => window.__DM_DEMO.pushRequests);
  if (
    !requests.some((request) => request.action === "subscribe") ||
    !requests.some((request) => request.action === "test")
  )
    throw new Error("Incomplete example flow");
  writeFileSync(
    join(work, "push-timeline.json"),
    JSON.stringify({ duration, recordingOffset, stages }, null, 2),
  );
  await page.screenshot({ path: join(work, "push-finished.png") });
  await context.close();
  await video.saveAs(join(work, "push.webm"));
  console.log(JSON.stringify({ duration, requests: requests.length }));
} finally {
  await browser.close();
}
