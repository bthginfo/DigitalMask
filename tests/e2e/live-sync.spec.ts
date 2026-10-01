import { test, expect, chromium, webkit, request as playwrightRequest } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { qaResources, trackQaResources } from "./qa-resources";

for (const browserName of ["chromium", "webkit"] as const)
  test.describe(browserName, () => {
    test("live team changes, replay and approved initials-based contact linking", async () => {
      test.setTimeout(120000);
      const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
      const browser = await (browserName === "webkit" ? webkit : chromium).launch();
      const context = await browser.newContext({
        baseURL,
        viewport:
          browserName === "webkit" ? { width: 390, height: 844 } : { width: 1365, height: 900 },
      });
      const page = await context.newPage();
      const writer = await playwrightRequest.newContext({ baseURL });
      const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
      const created = qaResources();
      const suffix = Date.now();
      let memberId = "";
      const create = async (kind: string, data: Record<string, unknown>) => {
        const response = await writer.post(`/api/records/${kind}`, { data: { data } });
        expect(response.status()).toBe(201);
        const row = await response.json();
        created.push({ kind, id: row.id });
        return row;
      };
      try {
        expect(
          (
            await writer.post("/api/login", {
              data: {
                username: credentials.match(/Benutzername: (.+)/)![1],
                password: credentials.match(/Passwort: (.+)/)![1],
              },
            })
          ).status(),
        ).toBe(200);
        const production = await create("productions", {
          title: `QA Live ${suffix}`,
          contacts: [
            { id: "makeup", role: "Maskenbetreuung", type: "makeup", name: "QA T.", memberId: "" },
          ],
        });
        const personId = production.data.contacts[0].personId;
        created.push({ kind: "people", id: personId });
        expect(
          (
            await context.request.post("/api/register", {
              data: {
                name: "QA Teammitglied",
                username: `qa_${suffix}`,
                password: "QA-long-password-2026",
              },
            })
          ).status(),
        ).toBe(201);
        let workspace = await (await writer.get("/api/workspace")).json();
        memberId = workspace.members.find(
          (member: { username: string }) => member.username === `qa_${suffix}`,
        ).id;
        trackQaResources({ kind: "member", id: memberId });
        const approval = await writer.post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { status: "active" } },
        });
        expect(approval.status()).toBe(200);
        expect((await approval.json()).linked.contacts).toBe(1);
        workspace = await (await writer.get("/api/workspace")).json();
        const linked = workspace.records.productions.find(
          (row: { id: string }) => row.id === production.id,
        );
        expect(linked.data.contacts[0]).toMatchObject({
          role: "Maskenbetreuung",
          memberId,
          personId: "",
        });
        expect(linked.data.memberIds).toContain(memberId);
        expect(
          workspace.records.people.find((row: { id: string }) => row.id === personId).data
            .linkedMemberId,
        ).toBe(memberId);
        const reuse = await create("productions", {
          title: `QA Reuse ${suffix}`,
          contacts: [
            {
              id: "makeup",
              role: "Maskenbetreuung",
              type: "makeup",
              name: "QA Teammitglied",
              memberId: "",
            },
          ],
        });
        expect(reuse.data.contacts[0].memberId).toBe(memberId);
        expect(
          (
            await writer.post("/api/records/people", { data: { data: { name: "QA T." } } })
          ).status(),
        ).toBe(409);
        expect(
          (
            await context.request.post("/api/login", {
              data: { username: `qa_${suffix}`, password: "QA-long-password-2026" },
            })
          ).status(),
        ).toBe(200);
        expect(
          (
            await context.request.post("/api/actions", {
              data: { action: "profile-update", data: { onboardingCompleted: true } },
            })
          ).status(),
        ).toBe(200);
        const own = await (await context.request.get("/api/workspace")).json();
        expect(own.live?.ticket).toBeTruthy();
        expect(own.attendanceTimer).toBeNull();
        expect(
          (
            await context.request.post("/api/actions", {
              data: { action: "attendance-timer-start", data: {} },
            })
          ).status(),
        ).toBe(200);
        expect(
          (await (await context.request.get("/api/workspace")).json()).attendanceTimer,
        ).not.toBeNull();
        expect(
          (
            await context.request.post("/api/actions", {
              data: { action: "attendance-timer-discard", data: {} },
            })
          ).status(),
        ).toBe(200);
        expect(
          (await (await context.request.get("/api/workspace")).json()).attendanceTimer,
        ).toBeNull();
        expect(
          (
            await writer.get(
              `/api/realtime?ticket=${encodeURIComponent(own.live.ticket)}&channel=${encodeURIComponent(own.live.channel)}`,
            )
          ).status(),
        ).toBe(401);
        await page.goto(`${baseURL}/?module=tasks`);
        await page.bringToFront();
        await expect(page.getByText("Live verbunden", { exact: true }).first()).toBeVisible({
          timeout: 30000,
        });
        let snapshotReads = 0,
          chatPolls = 0;
        page.on("request", (request) => {
          if (request.url().endsWith("/api/workspace")) snapshotReads++;
          if (request.url().includes("/api/messages?")) chatPolls++;
        });
        const task = await create("tasks", {
          title: `QA Live Aufgabe ${suffix}`,
          assigneeIds: [memberId],
        });
        await expect(page.getByText(task.data.title, { exact: true })).toBeVisible({
          timeout: 15000,
        });
        await context.setOffline(true);
        await expect(page.getByText("Offline", { exact: true }).first()).toBeVisible();
        const changed = await writer.patch(`/api/records/tasks/${task.id}`, {
          data: { version: task.version, data: { title: `QA Replay ${suffix}` } },
        });
        expect(changed.status()).toBe(200);
        await context.setOffline(false);
        await page.bringToFront();
        await expect(page.getByText(`QA Replay ${suffix}`, { exact: true })).toBeVisible({
          timeout: 15000,
        });
        await page.goto(`${baseURL}/?module=chat`);
        await page.bringToFront();
        await expect(page.getByText("Live verbunden", { exact: true }).first()).toBeVisible({
          timeout: 15000,
        });
        const message = await create("messages", { text: `QA Live Nachricht ${suffix}` });
        await expect(page.getByText(message.data.text, { exact: true })).toBeVisible({
          timeout: 15000,
        });
        expect(chatPolls).toBe(0);
        await page.waitForTimeout(1200);
        const stableReads = snapshotReads;
        await page.waitForTimeout(1200);
        expect(snapshotReads).toBe(stableReads);
        expect((await writer.delete(`/api/records/messages/${message.id}`)).status()).toBe(200);
        await expect(page.getByText(message.data.text, { exact: true })).toHaveCount(0, {
          timeout: 15000,
        });
      } finally {
        await page.goto("about:blank");
        for (const item of [...created].reverse())
          if (item.kind !== "people")
            await writer.delete(`/api/records/${item.kind}/${item.id}`).catch(() => {});
        for (const item of created.filter((item) => item.kind === "people"))
          await writer.delete(`/api/records/people/${item.id}`).catch(() => {});
        if (memberId)
          await writer
            .post("/api/actions", {
              data: { action: "member-update", id: memberId, data: { status: "disabled" } },
            })
            .catch(() => {});
        await writer.dispose();
        await browser.close();
      }
    });
  });
