import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recordKinds, type Workspace, type DomainRecord } from "../../src/shared/contracts";
test.use({ serviceWorkers: "block" });
async function mock(page: Page, mode = "supported", dark = false) {
  const workspace = JSON.parse(
    readFileSync("tests/e2e/operations-fixture.json", "utf8"),
  ) as Workspace;
  workspace.user.preferences = { accentPalette: "green", onboardingVersion: 2 };
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
    record("productions", "play-read", { title: "Gym", season: "2026/27", status: "active" }),
  );
  workspace.records.conversations.push(
    record("conversations", "private", {
      title: "Perückenplanung",
      mode: "direct",
      participantIds: [workspace.user.id, "other"],
    }),
    record("conversations", "team", { title: "Werkstatt", mode: "team", participantIds: [] }),
    record("conversations", "team-read", {
      title: "Bestellungen",
      mode: "team",
      participantIds: [],
    }),
    record("conversations", "group-read", {
      title: "Festvorbereitung",
      mode: "group",
      participantIds: [workspace.user.id, "other"],
    }),
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
  const readRequests: string[][] = [];
  let nextArrival: DomainRecord | null = null;
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
      if (action === "notifications-read") {
        readRequests.push(data.ids);
        for (const notice of workspace.records.notifications)
          if (notice.data.userId === workspace.user.id && data.ids.includes(notice.id))
            notice.data.read = true;
        if (nextArrival) {
          workspace.records.notifications.push(nextArrival);
          nextArrival = null;
        }
      }
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
  return {
    reads: () => reads,
    actions,
    readRequests,
    record,
    workspace,
    addNotice: (id: string) =>
      workspace.records.notifications.push(
        record("notifications", id, {
          type: "TaskAssignedV1",
          userId: workspace.user.id,
          read: false,
          title: "Neue Aufgabe",
        }),
      ),
    queueArrival: () => {
      nextArrival = record("notifications", "later-arrival", {
        type: "TaskAssignedV1",
        userId: workspace.user.id,
        read: false,
        title: "Spätere Mitteilung",
      });
    },
  };
}

test("opens the production task directly even if marking the notice read fails", async ({
  page,
}) => {
  const { workspace, record } = await mock(page);
  workspace.records.tasks = [
    record("tasks", "target-task", {
      productionId: "play",
      title: "Perücke nacharbeiten",
      status: "todo",
    }),
  ];
  workspace.records.notifications = [
    record("notifications", "target-notice", {
      type: "TaskAssignedV1",
      title: "Neue Aufgabe · Perücke",
      userId: workspace.user.id,
      link: "/?module=tasks",
      productionId: "play",
      recordId: "target-task",
    }),
  ];
  await page.route("**/api/actions", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await page.getByRole("link", { name: "Neue Aufgabe · Perücke" }).click();
  await expect(page).toHaveURL(/module=productions.*tab=tasks.*record=target-task/);
  await expect(page.getByRole("dialog", { name: "Perücke nacharbeiten" })).toBeVisible();
});

test("jumps from the mobile bell to a message outside the loaded history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { workspace, record } = await mock(page);
  workspace.records.messages = Array.from({ length: 25 }, (_, i) =>
    record("messages", `recent-${i}`, {
      userId: "other",
      conversationId: "private",
      text: `Neuere Nachricht ${i}`,
    }),
  );
  const target = {
    ...record("messages", "older-message", {
      userId: "other",
      conversationId: "private",
      text: "Der gesuchte Hinweis zur Perücke",
    }),
    createdAt: "2026-10-01T08:00:00Z",
  };
  workspace.records.notifications = [
    record("notifications", "message-notice", {
      type: "ChatMessageCreatedV1",
      title: "Neue private Nachricht",
      userId: workspace.user.id,
      conversationId: "private",
      recordId: target.id,
      link: "/?module=chat&conversationId=private",
    }),
  ];
  await page.route("**/api/records/messages/older-message", (route) =>
    route.fulfill({ json: target }),
  );
  await page.route("**/api/workspace*", (route) =>
    route.fulfill({
      json: {
        ...workspace,
        records: {
          ...workspace.records,
          notifications: workspace.records.notifications.filter((notice) => !notice.data.read),
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "1 ungelesene Mitteilungen" }).click();
  const notices = page.getByRole("dialog", { name: "Mitteilungen" });
  await expect(notices.getByText("Gelesen", { exact: true })).toBeVisible();
  await notices.getByRole("link", { name: /Neue private Nachricht/ }).click();
  await expect(page).toHaveURL(/conversationId=private.*messageId=older-message/);
  const message = page.locator(".chat-message.notification-target");
  await expect(message).toContainText(target.data.text as string);
  await expect(message).toBeInViewport();
  await expect(notices).toHaveCount(0);
});

test("scrolls from a leave notification to the matching calendar request", async ({ page }) => {
  const { workspace, record } = await mock(page);
  workspace.records.leave = [
    record("leave", "target-request", {
      userId: workspace.user.id,
      start: "2026-11-19",
      end: "2026-11-19",
      status: "approved",
      reason: "Freier Tag",
    }),
  ];
  workspace.records.notifications = [
    record("notifications", "leave-notice", {
      type: "LeaveRequestDecidedV1",
      userId: workspace.user.id,
      recordId: "target-request",
      title: "Freiwunsch genehmigt",
    }),
  ];
  await page.goto("/");
  await page.getByRole("link", { name: "Freiwunsch genehmigt" }).click();
  await expect(page.locator("#leave-target-request")).toBeInViewport({ ratio: 0.8 });
});

for (const width of [1440, 390]) {
  test(`notification read controls ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await mock(page);
    await page.goto("/");
    const allRead = page.getByRole("button", { name: "Alle als gelesen markieren", exact: true });
    const bulkBounds = await allRead.boundingBox();
    expect(bulkBounds!.height).toBeGreaterThanOrEqual(44);
    expect(bulkBounds!.x + bulkBounds!.width).toBeLessThanOrEqual(width);
    await allRead.click();
    await expect(page.locator(".today-notifications .notification-row")).toHaveCount(0);
    await expect(page.locator(".notification-button")).toHaveAttribute(
      "aria-label",
      "0 ungelesene Mitteilungen",
    );
    expect(state.readRequests).toHaveLength(1);
    expect(state.readRequests[0]).toHaveLength(7);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const metrics = (window as unknown as { dmPushMetrics: { badges: number[] } })
            .dmPushMetrics;
          return metrics?.badges.at(-1);
        }),
      )
      .toBe(0);

    state.addNotice("open-first");
    state.addNotice("open-second");
    state.queueArrival();
    await page.reload();
    await expect(page.locator(".notification-button")).toHaveAttribute(
      "aria-label",
      "2 ungelesene Mitteilungen",
    );
    await page.locator(".notification-button").click();
    const dialog = page.getByRole("dialog", { name: "Mitteilungen" });
    await expect(dialog.locator(".notification-row")).toHaveCount(3);
    await expect(dialog.getByText("Gelesen", { exact: true })).toHaveCount(2);
    await expect(page.locator(".notification-button")).toHaveAttribute(
      "aria-label",
      "1 ungelesene Mitteilungen",
    );
    expect(state.readRequests[1]).toEqual(["open-first", "open-second"]);
    await dialog.getByRole("button", { name: "Alle als gelesen markieren", exact: true }).click();
    await expect(dialog.getByText("Gelesen", { exact: true })).toHaveCount(3);
    await expect(dialog.locator(".notification-row")).toHaveCount(3);
    expect(state.readRequests[2]).toEqual(["later-arrival"]);
    await page.screenshot({ path: info.outputPath("notifications.png") });
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(width);
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
    await page.locator(".notification-button").click();
    await expect(dialog.locator(".notification-row")).toHaveCount(0);
    expect(state.readRequests).toHaveLength(3);
  });
  test(`channel groups persist, reveal search and keep unread accessible ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mock(page, "supported", width === 390);
    await page.goto("/?module=chat&conversationId=private");
    await expect
      .poll(() => state.actions.filter((action) => action === "chat-notifications-read").length)
      .toBe(1);
    if (width === 390) await page.locator(".chat-channel-toggle").click();
    const navigation = page.getByRole("navigation", { name: "Kommunikationskanäle" });
    const productions = navigation.getByRole("button", { name: "Produktionen", exact: true });
    await expect(productions).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("button", { name: /^Gym/ })).not.toBeVisible();
    await expect(
      navigation.getByRole("button", { name: "Ungelesen", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("button", { name: /^Sommernacht/ })).toBeVisible();
    const reads = state.reads();
    await productions.focus();
    await productions.press("Enter");
    await expect(productions).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("button", { name: /^Gym/ })).toBeVisible();
    await productions.press("Enter");
    for (const label of ["Team", "Direktnachrichten", "Gruppen"]) {
      const toggle = navigation.getByRole("button", { name: label, exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
    await expect(navigation.getByRole("button", { name: /^Bestellungen/ })).not.toBeVisible();
    await expect(navigation.getByRole("button", { name: /^Festvorbereitung/ })).not.toBeVisible();
    await page.getByRole("searchbox", { name: "Kanäle und Personen suchen" }).fill("Gym");
    await expect(productions).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("button", { name: /^Gym/ })).toBeVisible();
    await page.getByRole("searchbox", { name: "Kanäle und Personen suchen" }).fill("");
    await expect(productions).toHaveAttribute("aria-expanded", "false");
    expect(state.reads()).toBe(reads);
    await page.reload();
    if (width === 390) await page.locator(".chat-channel-toggle").click();
    for (const label of ["Team", "Produktionen", "Gruppen"])
      await expect(navigation.getByRole("button", { name: label, exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    // The group holding the open chat is always revealed.
    await expect(
      navigation.getByRole("button", { name: "Direktnachrichten", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
  test(`chat unread routing and collapse ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await mock(page, "supported", width === 390);
    await page.goto("/?module=today");
    const nav =
      width === 1440
        ? page.getByRole("navigation", { name: "Hauptnavigation" })
        : page.locator(".bottom-nav");
    // Navigation entries are links; the unread count is part of their accessible name.
    const chatLabel = "Chat";
    const chatLink = nav.getByRole("link", { name: new RegExp(`^${chatLabel}`) });
    await expect(chatLink).toHaveAccessibleName(`${chatLabel} · 6 ungelesene Nachrichten`);
    await page.goto("/?module=chat&conversationId=private");
    await expect
      .poll(() => state.actions.filter((action) => action === "chat-notifications-read").length)
      .toBe(1);
    await expect(chatLink).toHaveAccessibleName(`${chatLabel} · 4 ungelesene Nachrichten`);
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
test("iOS install button opens guidance, restores focus and stays hidden in installed apps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, "ios", true);
  await page.goto("/?module=chat");
  const install = page.getByRole("button", { name: "App installieren", exact: true });
  await expect(install).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await install.click();
  const dialog = page.getByRole("dialog", { name: "DigitalMask auf dem iPhone oder iPad" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Zum Home-Bildschirm");
  await expect(dialog).toContainText("Als Web-App öffnen");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Verstanden", exact: true }).click();
  await expect(install).toBeFocused();
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true }),
  );
  await page.reload();
  await expect(install).toHaveCount(0);
});

test("native install prompt runs only after a click and disappears after use", async ({ page }) => {
  await mock(page);
  await page.goto("/?module=chat");
  await expect(page.locator(".workspace-footer")).toBeVisible();
  await page.evaluate(() => {
    const metrics = { prompts: 0 };
    Object.defineProperty(window, "dmInstallMetrics", { value: metrics });
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        metrics.prompts++;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  const install = page.getByRole("button", { name: "App installieren", exact: true });
  await expect(install).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { dmInstallMetrics: { prompts: number } }).dmInstallMetrics.prompts,
    ),
  ).toBe(0);
  await install.click();
  await expect(install).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { dmInstallMetrics: { prompts: number } }).dmInstallMetrics.prompts,
    ),
  ).toBe(1);
});

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
