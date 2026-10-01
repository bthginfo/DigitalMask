import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DomainRecord } from "../../src/shared/contracts";
import { qaResources, trackQaResources } from "./qa-resources";

test("all roles correct booked work and attendance; affected approvals reopen", async ({
  page,
}) => {
  test.setTimeout(120000);
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
  const admin = await request.newContext({ baseURL });
  const member = page.request;
  const created = qaResources();
  const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  const username = `qa_${Date.now()}`;
  const password = "QA-long-password-2026";
  let memberId = "";
  const workspace = async () => await (await admin.get("/api/workspace")).json();
  const create = async (
    client: APIRequestContext,
    kind: string,
    data: object,
  ): Promise<DomainRecord> => {
    const response = await client.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const row = await response.json();
    created.push({ kind, id: row.id });
    return row;
  };
  const patch = async (
    client: APIRequestContext,
    row: DomainRecord,
    data: object,
  ): Promise<DomainRecord> => {
    const response = await client.patch(`/api/records/${row.kind}/${encodeURIComponent(row.id)}`, {
      data: { data, version: row.version },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  const submit = async (week: string): Promise<DomainRecord> => {
    const response = await member.post("/api/actions", {
      data: { action: "timesheet-submit", data: { week } },
    });
    expect(response.status()).toBe(200);
    const row = await response.json();
    created.push({ kind: "timesheets", id: row.id });
    return row;
  };
  const approve = async (sheet: DomainRecord) => {
    const response = await admin.post("/api/actions", {
      data: {
        action: "timesheet-decide",
        id: sheet.id,
        data: { status: "approved", version: sheet.version },
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  try {
    expect(
      (
        await admin.post("/api/login", {
          data: {
            username: credentials.match(/Benutzername: (.+)/)![1].trim(),
            password: credentials.match(/Passwort: (.+)/)![1].trim(),
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.post("/api/register", {
          data: { name: "QA Teammitglied", username, password },
        })
      ).status(),
    ).toBe(201);
    await expect
      .poll(
        async () =>
          (await workspace()).members.some(
            (row: { username: string }) => row.username === username,
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    memberId = (await workspace()).members.find(
      (row: { username: string }) => row.username === username,
    ).id;
    trackQaResources({ kind: "member", id: memberId });
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { status: "active" } },
        })
      ).status(),
    ).toBe(200);
    expect((await member.post("/api/login", { data: { username, password } })).status()).toBe(200);
    expect(
      (
        await member.post("/api/actions", {
          data: { action: "profile-update", data: { onboardingCompleted: true } },
        })
      ).status(),
    ).toBe(200);
    const production = await create(admin, "productions", {
      title: `QA Zeitkorrektur ${username}`,
      memberIds: [memberId],
    });
    let work = await create(member, "time", {
      title: "QA Produktionszeit",
      date: "2026-09-30",
      durationSeconds: 3600,
      category: "production",
      productionId: production.id,
    });
    let attendance = await create(member, "attendance", {
      title: "QA Anwesenheit",
      date: "2026-09-30",
      start: "2026-09-30T09:00:00+02:00",
      end: "2026-09-30T17:00:00+02:00",
      durationSeconds: 28800,
    });
    const otherAttendance = await create(admin, "attendance", {
      title: "QA anderer Besitzer",
      date: "2026-09-30",
      start: "2026-09-30T09:00:00+02:00",
      end: "2026-09-30T17:00:00+02:00",
      durationSeconds: 28800,
    });
    expect(
      (
        await member.patch(`/api/records/attendance/${otherAttendance.id}`, {
          data: { data: { pauseSeconds: 900 }, version: otherAttendance.version },
        })
      ).status(),
    ).toBe(403);
    attendance = await patch(member, attendance, { pauseSeconds: 1800 });
    expect(attendance.data.durationSeconds).toBe(27000);
    let sheet = await approve(await submit("2026-09-28"));
    // An unchanged save must not invalidate a valid approval.
    work = await patch(member, work, work.data);
    await expect
      .poll(
        async () =>
          (await workspace()).records.timesheets.find((row: DomainRecord) => row.id === sheet.id)
            ?.data.status,
        { timeout: 10000 },
      )
      .toBe("approved");
    expect(
      (await workspace()).records.timesheets.find((row: DomainRecord) => row.id === sheet.id).data
        .status,
    ).toBe("approved");
    await page.goto("/?module=time");
    await page.getByRole("button", { name: "Produktions- / Arbeitszeiten", exact: true }).click();
    await page.getByLabel("Woche ab").fill("2026-09-28");
    await page
      .getByRole("row")
      .filter({ hasText: "QA Produktionszeit" })
      .getByRole("button", { name: "Bearbeiten", exact: true })
      .click();
    await page.getByLabel("Datum", { exact: true }).fill("2026-09-29");
    await page.getByLabel("Beginn & Ende", { exact: true }).check();
    await expect(page.getByLabel("Ende", { exact: true })).toHaveValue("2026-09-29T17:00");
    await page.getByLabel("Ende", { exact: true }).fill("2026-09-30T17:00");
    await page.getByLabel("Beginn", { exact: true }).fill("2026-09-28T09:00");
    await expect(page.getByLabel("Ende", { exact: true })).toHaveValue("2026-09-30T17:00");
    await page.getByLabel("Dauer", { exact: true }).check();
    await page.getByLabel("Datum", { exact: true }).fill("2026-09-30");
    await page.getByLabel("Dauer in Minuten").fill("75");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let current = await workspace();
    work = current.records.time.find((row: DomainRecord) => row.id === work.id);
    expect(work.data.durationSeconds).toBe(4500);
    expect(current.projectHours[production.id]).toBe(4500);
    sheet = current.records.timesheets.find((row: DomainRecord) => row.id === sheet.id);
    expect(sheet.data.status).toBe("changes_requested");
    expect(
      (
        await admin.post("/api/actions", {
          data: {
            action: "timesheet-decide",
            id: sheet.id,
            data: { status: "approved", version: sheet.version - 1 },
          },
        })
      ).status(),
    ).toBe(409);
    sheet = await approve(await submit("2026-09-28"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Anwesenheit im Theater", exact: true }).click();
    await page.getByLabel("Woche ab").fill("2026-09-28");
    await page.getByRole("button", { name: /Anwesenheit vom .* bearbeiten/ }).click();
    await page.getByLabel("Beginn", { exact: true }).fill("2026-09-29T09:00");
    await expect(page.getByLabel("Ende", { exact: true })).toHaveValue("2026-09-29T17:00");
    await page.getByLabel("Beginn", { exact: true }).fill("2026-09-30T09:00");
    await page.getByLabel("Pause in Minuten").fill("45");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    current = await workspace();
    attendance = current.records.attendance.find((row: DomainRecord) => row.id === attendance.id);
    expect(attendance.data.durationSeconds).toBe(26100);
    expect(
      current.records.timesheets.find((row: DomainRecord) => row.id === sheet.id).data.status,
    ).toBe("approved");
    expect(
      (
        await admin.post("/api/actions", {
          data: {
            action: "member-update",
            id: memberId,
            data: { role: "admin", status: "active" },
          },
        })
      ).status(),
    ).toBe(200);
    expect((await member.post("/api/login", { data: { username, password } })).status()).toBe(200);
    work = await patch(member, work, { durationSeconds: 5400 });
    attendance = await patch(member, attendance, { end: "2026-09-30T16:00:00+02:00" });
    expect(attendance.data.userId).toBe(memberId);
    sheet = await approve(await submit("2026-09-28"));
    const nextSheet = await approve(await submit("2026-10-05"));
    // Superadmin corrections keep the original owner and reopen both moved weeks.
    work = await patch(admin, work, {
      date: "2026-10-05",
      durationSeconds: 7200,
      userId: "forged-owner",
    });
    expect(work.data.userId).toBe(memberId);
    attendance = await patch(admin, attendance, { pauseSeconds: 600 });
    expect(attendance.data.durationSeconds).toBe(24600);
    current = await workspace();
    for (const id of [sheet.id, nextSheet.id])
      expect(
        current.records.timesheets.find((row: DomainRecord) => row.id === id).data.status,
      ).toBe("changes_requested");
  } finally {
    await page.goto("about:blank");
    for (const item of [...created].reverse())
      if (item.kind !== "timesheets")
        await admin
          .delete(`/api/records/${item.kind}/${encodeURIComponent(item.id)}`)
          .catch(() => {});
    if (memberId)
      await admin
        .post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { status: "disabled" } },
        })
        .catch(() => {});
    await admin.dispose();
  }
});
