import { defineConfig } from "@playwright/test";
import { mockSessionState } from "./tests/e2e/session-cookie";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  // A placeholder session cookie passes the "/" login redirect in src/proxy.ts; real sessions
  // from logins in backend specs replace it.
  use: { baseURL, trace: "retain-on-failure", storageState: mockSessionState(baseURL) },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
});
