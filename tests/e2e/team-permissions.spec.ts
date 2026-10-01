import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { qaResources, trackQaResources } from "./qa-resources";
import type { DomainRecord, RecordData } from "../../src/shared/contracts";

test("normal team account manages shared work and calendars but not categories or approvals", async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const admin = await request.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const access = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  const resources = qaResources();
  const members: string[] = [];
  const password = "QA-long-password-2026";
  const stamp = Date.now();
  const create = async (
    client: APIRequestContext,
    kind: string,
    data: RecordData,
  ): Promise<DomainRecord> => {
    const response = await client.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const row = await response.json();
    resources.push({ kind, id: row.id });
    return row;
  };
  try {
    expect(
      (
        await admin.post("/api/login", {
          data: {
            username: access.match(/Benutzername: (.+)/)![1].trim(),
            password: access.match(/Passwort: (.+)/)![1].trim(),
          },
        })
      ).status(),
    ).toBe(200);
    for (const suffix of [0, 1]) {
      const username = `qa_${stamp + suffix}`;
      expect(
        (
          await page.request.post("/api/register", {
            data: { name: "QA Teammitglied", username, password },
          })
        ).status(),
      ).toBe(201);
      await expect
        .poll(
          async () =>
            (await (await admin.get("/api/workspace")).json()).members.some(
              (member: { username: string }) => member.username === username,
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      const current = await (await admin.get("/api/workspace")).json();
      const id = current.members.find(
        (member: { username: string }) => member.username === username,
      ).id;
      members.push(id);
      trackQaResources({ kind: "member", id });
      expect(
        (
          await admin.post("/api/actions", {
            data: { action: "member-update", id, data: { status: "active" } },
          })
        ).status(),
      ).toBe(200);
    }
    expect(
      (
        await page.request.post("/api/login", { data: { username: `qa_${stamp}`, password } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/actions", {
          data: { action: "profile-update", data: { onboardingCompleted: true } },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/?module=people");
    await page.getByRole("button", { name: "Person anlegen", exact: true }).first().click();
    await page
      .getByRole("dialog")
      .getByLabel("Name *", { exact: true })
      .fill(`QA Kontakt ${stamp}`);
    const personSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/records/people") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Kontakt anlegen", exact: true }).click();
    const personResponse = await personSaved;
    expect(personResponse.status()).toBe(201);
    const person = await personResponse.json();
    resources.push({ kind: "people", id: person.id });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/?module=productions");
    await page.getByRole("button", { name: "Produktion anlegen", exact: true }).click();
    await page.getByLabel("Titel *", { exact: true }).fill(`QA Teamproduktion ${stamp}`);
    await page.getByLabel("QA Teammitglied", { exact: true }).nth(1).check();
    const productionSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/records/productions") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    const productionResponse = await productionSaved;
    expect(productionResponse.status(), await productionResponse.text()).toBe(201);
    const production = await productionResponse.json();
    resources.push({ kind: "productions", id: production.id });
    expect(production.data.memberIds).toEqual(expect.arrayContaining(members));
    const makeupProduction = await create(page.request, "productions", {
      title: "QA Maskenbetreuung",
      contacts: [
        {
          id: "qa-makeup",
          role: "Maskenbetreuung",
          type: "makeup",
          name: "",
          memberId: members[1],
        },
      ],
    });
    expect(makeupProduction.data.memberIds).toEqual(expect.arrayContaining(members));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(`/?module=productions&productionId=${production.id}&tab=tasks`);
    await expect(page.getByRole("button", { name: "Sprint planen", exact: true })).toBeVisible();
    const actor = await create(page.request, "actors", { name: `QA Schauspieler ${stamp}` });
    const figure = await create(page.request, "characters", {
      name: "QA Figur",
      productionId: production.id,
    });
    await create(page.request, "casting", {
      productionId: production.id,
      actorId: actor.id,
      characterId: figure.id,
    });
    await create(page.request, "sprints", {
      title: "QA Sprint",
      productionId: production.id,
      start: "2026-10-01",
      end: "2026-10-08",
    });
    await create(page.request, "templates", { title: "QA Vorlage" });
    const sharedTask = await create(admin, "tasks", {
      title: "QA Gemeinsame Aufgabe",
      productionId: production.id,
    });
    expect(
      (
        await page.request.patch(`/api/records/tasks/${sharedTask.id}`, {
          data: { version: sharedTask.version, data: { status: "doing" } },
        })
      ).status(),
    ).toBe(200);
    const sharedLook = await create(admin, "looks", {
      actorName: "QA Schauspieler",
      productionId: production.id,
      sections: [],
    });
    expect(
      (
        await page.request.patch(`/api/records/looks/${sharedLook.id}`, {
          data: { version: sharedLook.version, data: { durationMinutes: 90 } },
        })
      ).status(),
    ).toBe(200);
    const calendar = await create(page.request, "events", {
      title: "QA Teamtermin",
      category: "service",
      start: "2099-10-01T12:00:00+02:00",
      end: "2099-10-01T13:00:00+02:00",
      participantIds: [members[0]],
    });
    expect(
      (
        await page.request.patch(`/api/records/events/${calendar.id}`, {
          data: { version: calendar.version, data: { title: "QA Teamtermin korrigiert" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(`/api/records/events/${calendar.id}`, {
          data: { version: calendar.version + 1, data: { participantIds: [members[1]] } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/records/events", {
          data: { data: { ...calendar.data, participantIds: [members[1]] } },
        })
      ).status(),
    ).toBe(403);
    const otherCalendar = await create(admin, "events", {
      ...calendar.data,
      participantIds: [members[1]],
    });
    expect(
      (
        await page.request.patch(`/api/records/events/${otherCalendar.id}`, {
          data: { version: otherCalendar.version, data: { title: "QA Verweigert" } },
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.delete(`/api/records/events/${otherCalendar.id}`)).status()).toBe(
      403,
    );
    expect(
      (
        await admin.patch(`/api/records/events/${otherCalendar.id}`, {
          data: { version: otherCalendar.version, data: { title: "QA Admin korrigiert" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/records/categories", {
          data: { data: { scope: "time", key: "qa", name: "QA Kategorie" } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/records/calendarCategories", {
          data: { data: { key: "qa", name: "QA Kalenderart", color: "#377a68" } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/actions", {
          data: { action: "leave-decide", id: "missing", data: { status: "approved" } },
        })
      ).status(),
    ).toBe(403);
    const hidden = await create(admin, "productions", {
      title: "QA Gesperrte Produktion",
      memberIds: [members[1]],
    });
    const copiedResponse = await page.request.post("/api/actions", {
      data: { action: "production-copy", id: production.id, data: { title: "QA Wiederaufnahme" } },
    });
    expect(copiedResponse.status(), await copiedResponse.text()).toBe(200);
    const copied = await copiedResponse.json();
    resources.push({ kind: "productions", id: copied.id });
    expect(
      (
        await page.request.post("/api/actions", {
          data: { action: "production-copy", id: hidden.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`/api/records/productions/${hidden.id}`, {
          data: { version: hidden.version, data: { title: "QA Zugriff verweigert" } },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/?module=calendar");
    await expect(page.getByRole("button", { name: "Termin", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kalenderarten", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Termin", exact: true }).click();
    await expect(page.getByRole("dialog").locator("fieldset input[type=checkbox]")).toHaveCount(1);
    await expect(page.getByRole("dialog").locator("fieldset input[type=checkbox]")).toBeDisabled();
    await page.goto("about:blank");
    expect((await page.request.delete(`/api/records/events/${calendar.id}`)).status()).toBe(200);
    expect((await page.request.delete(`/api/records/actors/${actor.id}`)).status()).toBe(409);
  } finally {
    await page.goto("about:blank").catch(() => {});
    for (const item of [...resources].reverse())
      await admin.delete(`/api/records/${item.kind}/${item.id}`).catch(() => {});
    for (const id of members)
      await admin
        .post("/api/actions", {
          data: { action: "member-update", id, data: { status: "disabled" } },
        })
        .catch(() => {});
    await admin.dispose();
  }
});
