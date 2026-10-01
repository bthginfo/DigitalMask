import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { trackQaResources } from "./qa-resources";

test("empty calendar selection, explicit all mode, team view and exports agree", async ({
  page,
}) => {
  const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  expect(
    (
      await page.request.post("/api/login", {
        data: {
          username: credentials.match(/Benutzername: (.+)/)![1].trim(),
          password: credentials.match(/Passwort: (.+)/)![1].trim(),
        },
      })
    ).status(),
  ).toBe(200);
  const title = `QA Kalenderauswahl ${Date.now()}`;
  const day = new Date().toISOString().slice(0, 10);
  const response = await page.request.post("/api/records/events", {
    data: {
      data: {
        title,
        start: `${day}T12:00:00+02:00`,
        end: `${day}T13:00:00+02:00`,
        category: "service",
        participantIds: [],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const event = await response.json();
  trackQaResources({ kind: "events", id: event.id });
  try {
    await page.goto("/?module=calendar");
    await expect(page.getByText("Kein Kalender ausgewählt.", { exact: false })).toBeVisible();
    await expect(page.locator(".fc-event")).toHaveCount(0);
    const emptyExport = await page.request.get(
      `/api/export?kind=events&format=json&userIds=&from=${day}&to=${day}`,
    );
    expect(emptyExport.status()).toBe(200);
    expect((await emptyExport.json()).records).toEqual([]);
    await page.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page.getByRole("button", { name: "Alle anzeigen", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: new RegExp(title) }).first()).toBeVisible();
    await page.getByRole("button", { name: "Monat", exact: true }).click();
    await expect(page.locator(".fc-event")).toHaveCount(0);
    await page.getByRole("button", { name: "Alle anzeigen", exact: true }).click();
    await expect(page.locator(".fc-event").filter({ hasText: title })).toBeVisible();
    const allExport = await page.request.get(
      `/api/export?kind=events&format=json&from=${day}&to=${day}`,
    );
    expect(allExport.status()).toBe(200);
    expect(
      (await allExport.json()).records.some((row: { id: string }) => row.id === event.id),
    ).toBe(true);
    await page.getByRole("button", { name: "Alle anzeigen", exact: true }).click();
    await expect(page.locator(".fc-event")).toHaveCount(0);
    const calendars = page.locator(".calendar-filters input[type=checkbox]");
    if (await calendars.count()) {
      await calendars.first().check();
      await expect(page.locator(".fc-event").filter({ hasText: title })).toHaveCount(0);
      await calendars.first().uncheck();
      await expect(page.locator(".fc-event")).toHaveCount(0);
    }
  } finally {
    await page.goto("about:blank");
    expect((await page.request.delete(`/api/records/events/${event.id}`)).status()).toBe(200);
    await page.request.post("/api/logout");
  }
});
