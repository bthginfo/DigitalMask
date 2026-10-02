import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type Workspace, type DomainRecord } from "../../src/shared/contracts";
test.use({ serviceWorkers: "block" });
async function mock(page: Page, mode = "supported", dark = false) {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.preferences = { accentPalette: "green", onboardingVersion: 1 };
  for (const kind of recordKinds) workspace.records[kind] = [];
  const record = (
    kind: DomainRecord["kind"],
    id: string,
    data: DomainRecord["data"],
  ): DomainRecord => ({
    kind,
    id,
    data,
    version: 1,
    organizationId: "qa",
    departmentId: "qa",
    createdBy: "other",
    createdAt: "2026-10-02T08:00:00Z",
    updatedAt: "2026-10-02T08:00:00Z",
  });
  workspace.records.productions.push(
    record("productions", "play", { title: "Sommernacht", season: "2026/27", status: "active" }),
  );
  workspace.records.conversations.push(
    record("conversations", "private", {
      title: "Perückenplanung",
      mode: "direct",
      participantIds: [workspace.user.id, "other"],
    }),
    record("conversations", "team", { title: "Werkstatt", mode: "team", participantIds: [] }),
  );
  for (const [index, conversationId, productionId] of [
    [0, "", ""],
    [1, "", ""],
    [2, "private", ""],
    [3, "private", ""],
    [4, "", "play"],
    [5, "team", ""],
  ] as const) {
    workspace.records.notifications.push(
      record("notifications", `notice-${index}`, {
        type: "ChatMessageCreatedV1",
        userId: workspace.user.id,
        title: "Neue Nachricht",
        read: false,
        conversationId,
        productionId,
      }),
    );
  }
  workspace.records.notifications.push(
    record("notifications", "task", {
      type: "TaskAssignedV1",
      userId: workspace.user.id,
      title: "Neue Aufgabe",
      read: false,
    }),
  );
  let reads = 0,
    active = false;
  const actions: string[] = [];
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (pathname === "/api/push") {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: {
            configured: true,
            publicKey: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString("base64url"),
          },
        });
      const data = route.request().postDataJSON();
      actions.push(data.action);
      if (data.action === "subscribe") active = true;
      if (data.action === "unsubscribe") active = false;
      return route.fulfill({ json: { active, ok: true } });
    }
    if (pathname === "/api/actions") {
      const { action, data } = route.request().postDataJSON();
      actions.push(action);
      if (action === "chat-notifications-read")
        for (const notice of workspace.records.notifications) {
          if (
            notice.data.type === "ChatMessageCreatedV1" &&
            String(notice.data.conversationId || "") === data.conversationId &&
            (data.conversationId || String(notice.data.productionId || "") === data.productionId)
          )
            notice.data.read = true;
        }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { messages: [], ok: true } });
  });
  await page.addInitScript(
    ({ mode, dark }) => {
      localStorage.setItem("digitalmask-theme", dark ? "dark" : "light");
      const metrics = { prompts: 0, badges: [] as number[], subscribed: false };
      Object.defineProperty(window, "dmPushMetrics", { value: metrics });
      const notification = {
        permission: mode === "denied" ? "denied" : "default",
        requestPermission: async () => {
          metrics.prompts++;
          notification.permission = "granted";
          return "granted";
        },
      };
      Object.defineProperty(window, "Notification", { configurable: true, value: notification });
      Object.defineProperty(window, "PushManager", { configurable: true, value: function () {} });
      if (mode === "ios")
        Object.defineProperty(navigator, "userAgent", {
          value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)",
        });
      Object.defineProperty(navigator, "setAppBadge", {
        value: async (count: number) => {
          metrics.badges.push(count);
        },
      });
      Object.defineProperty(navigator, "clearAppBadge", {
        value: async () => {
          metrics.badges.push(0);
        },
      });
      const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/fixture",
          expirationTime: null,
          keys: { p256dh: "fixture", auth: "fixture" },
        }),
        unsubscribe: async () => {
          metrics.subscribed = false;
          return true;
        },
      };
      const registration = {
        active: {
          postMessage: (_: unknown, ports: MessagePort[]) => {
            ports[0]?.postMessage({ ok: true });
          },
        },
        pushManager: {
          getSubscription: async () => (metrics.subscribed ? subscription : null),
          subscribe: async () => {
            metrics.subscribed = true;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { register: async () => registration, ready: Promise.resolve(registration) },
      });
    },
    { mode, dark },
  );
  return { reads: () => reads, actions };
}
for (const width of [1440, 390]) {
  test(`chat unread routing and collapse ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mock(page, "supported", width === 390);
    await page.goto("/?module=today");
    const nav =
      width === 1440
        ? page.getByRole("navigation", { name: "Hauptnavigation" })
        : page.locator(".bottom-nav");
    await expect(nav.getByRole("button", { name: "Kommunikation", exact: true })).toHaveAttribute(
      "aria-description",
      "6 ungelesene Nachrichten",
    );
    await page.goto("/?module=chat&conversationId=private");
    await expect
      .poll(() => state.actions.filter((action) => action === "chat-notifications-read").length)
      .toBe(1);
    await expect(nav.getByRole("button", { name: "Kommunikation", exact: true })).toHaveAttribute(
      "aria-description",
      "4 ungelesene Nachrichten",
    );
    const channelLists = page.locator(".chat-channel-lists");
    if (width === 1440) {
      await expect(channelLists).toBeVisible();
      await page.getByRole("button", { name: "Kanalauswahl einklappen", exact: true }).click();
      await expect(channelLists).not.toBeVisible();
      await page.screenshot({ path: info.outputPath("chat-collapsed.png"), fullPage: true });
      const reads = state.reads();
      await page.reload();
      await expect(page.getByRole("button", { name: /^Kanalauswahl öffnen/ })).toBeVisible();
      await expect(channelLists).not.toBeVisible();
      await page.getByRole("button", { name: /^Kanalauswahl öffnen/ }).click();
      expect(state.reads()).toBe(reads + 1);
    } else {
      await expect(page.locator(".chat-desktop-sidebar-toggle")).not.toBeVisible();
      await page.locator(".chat-channel-toggle").click();
    }
    await expect(
      page
        .locator(".channel-choice")
        .filter({ hasText: "Maske · Allgemein" })
        .locator(".chat-unread-count"),
    ).toHaveText("2");
    await expect(
      page
        .locator(".channel-choice")
        .filter({ hasText: "Sommernacht" })
        .locator(".chat-unread-count"),
    ).toHaveText("1");
    await expect(
      page
        .locator(".channel-choice")
        .filter({ hasText: "Werkstatt" })
        .locator(".chat-unread-count"),
    ).toHaveText("1");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("chat-channels.png"), fullPage: true });
  });
  test(`device push opt-in and controls ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mock(page, "supported", width === 390);
    await page.goto("/?module=settings");
    await expect(
      page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { dmPushMetrics: { prompts: number } }).dmPushMetrics.prompts,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }).click();
    await expect(
      page.getByText("Mitteilungen sind auf diesem Gerät aktiviert.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Testmitteilung", exact: true }).click();
    await expect(
      page.getByText(
        "Die Testmitteilung wurde gesendet. Prüfe die Mitteilungen auf deinem Gerät.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(state.actions).toContain("subscribe");
    expect(state.actions).toContain("test");
    await page.screenshot({ path: info.outputPath("push-active.png"), fullPage: true });
    await page
      .locator(".push-device-card")
      .getByRole("button", { name: "Deaktivieren", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }),
    ).toBeVisible();
    expect(state.actions).toContain("unsubscribe");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}
test("iPhone installation guidance and blocked permission are explicit", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "ios");
  await page.goto("/?module=settings");
  await expect(page.getByText("Öffne DigitalMask als App.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("iphone-guidance.png"), fullPage: true });
});
test("blocked notification permission explains device settings without prompting", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "denied");
  await page.goto("/?module=settings");
  await expect(
    page.getByText("Mitteilungen sind auf diesem Gerät blockiert.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mitteilungen aktivieren", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("blocked-guidance.png"), fullPage: true });
});
