import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/** Register after blocking/routing API traffic and before the first navigation. */
export async function installMaskPlanBrowserSafety(page: Page, dark = false) {
  await page.addInitScript({
    content: [
      "window.__MASK_TEST_FETCH = window.fetch;",
      readFileSync("scripts/tutorials/demo-init.js", "utf8"),
      readFileSync("scripts/tutorials/workflow-demo.js", "utf8"),
      "window.fetch = window.__MASK_TEST_FETCH; window.EventSource = class { close() {} addEventListener() {} removeEventListener() {} };",
      `localStorage.setItem("digitalmask-theme", "${dark ? "dark" : "light"}");`,
    ].join("\n"),
  });
}
