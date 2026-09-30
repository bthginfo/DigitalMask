import { test, expect, request as playwrightRequest } from "@playwright/test";
import { readFile } from "node:fs/promises";
const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
const username = credentials.match(/Benutzername: (.+)/)![1];
const password = credentials.match(/Passwort: (.+)/)![1];
test("real database workflows, permissions and booking integrity", async () => {
  const admin = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const member = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const suffix = Date.now().toString();
  const name = `qa_${suffix}`;
  const created: { kind: string; id: string }[] = [];
  let memberId = "";
  const create = async (kind: string, data: Record<string, unknown>) => {
    const response = await admin.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    created.push({ kind, id: result.id });
    return result;
  };
  try {
    const login = await admin.post("/api/login", { data: { username, password } });
    expect(login.status(), await login.text()).toBe(200);
    const signup = await member.post("/api/register", {
      data: { name: "QA Teammitglied", username: name, password: "QA-long-password-2026" },
    });
    expect(signup.status(), await signup.text()).toBe(201);
    expect(
      (
        await member.post("/api/login", {
          data: { username: name, password: "QA-long-password-2026" },
        })
      ).status(),
    ).toBe(200);
    expect((await member.get("/api/workspace")).status()).toBe(403);
    const workspace = await (await admin.get("/api/workspace")).json();
    memberId = workspace.members.find((m: { username: string }) => m.username === name).id;
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { status: "active" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.post("/api/login", {
          data: { username: name, password: "QA-long-password-2026" },
        })
      ).status(),
    ).toBe(200);
    const production = await create("productions", {
      title: `QA Produktion ${suffix}`,
      memberIds: [memberId],
    });
    const forbidden = await member.post("/api/records/productions", {
      data: { data: { title: "Verbotene Produktion" } },
    });
    expect(forbidden.status()).toBe(403);
    const task = await create("tasks", {
      title: "QA Perücke vorbereiten",
      productionId: production.id,
      assigneeIds: [memberId],
    });
    expect(
      (
        await member.patch(`/api/records/tasks/${task.id}`, {
          data: { version: task.version, data: { status: "doing" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.patch(`/api/records/tasks/${task.id}`, {
          data: { version: task.version, data: { status: "done" } },
        })
      ).status(),
    ).toBe(409);
    const bookingData = {
      title: "QA Haare",
      productionId: production.id,
      category: "production",
      date: "2026-09-29",
      start: "2026-09-29T10:00:00+02:00",
      end: "2026-09-29T11:00:00+02:00",
      durationSeconds: 3600,
      pauseSeconds: 0,
      idempotencyKey: `qa:${suffix}`,
    };
    const booking = await member.post("/api/records/time", { data: { data: bookingData } });
    expect(booking.status(), await booking.text()).toBe(201);
    const row = await booking.json();
    created.push({ kind: "time", id: row.id });
    const duplicate = await member.post("/api/records/time", { data: { data: bookingData } });
    expect((await duplicate.json()).id).toBe(row.id);
    expect(
      (
        await member.post("/api/records/time", {
          data: {
            data: {
              ...bookingData,
              idempotencyKey: `qa:other:${suffix}`,
              start: "2026-09-29T10:30:00+02:00",
              end: "2026-09-29T11:30:00+02:00",
            },
          },
        })
      ).status(),
    ).toBe(409);
    const own = await (await member.get("/api/workspace")).json();
    expect(
      own.records.time.every((r: { data: { userId: string } }) => r.data.userId === memberId),
    ).toBe(true);
    expect(own.projectHours[production.id]).toBe(3600);
    const exportResponse = await member.get(
      `/api/export?kind=time&format=csv&productionId=${production.id}`,
    );
    expect(exportResponse.status()).toBe(200);
    expect(await exportResponse.text()).toContain("QA Haare");
    const submitted = await member.post("/api/actions", {
      data: { action: "timesheet-submit", data: { week: "2026-09-28" } },
    });
    expect(submitted.status(), await submitted.text()).toBe(200);
    const sheet = await submitted.json();
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "timesheet-decide", id: sheet.id, data: { status: "approved" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.patch(`/api/records/time/${row.id}`, {
          data: { version: row.version, data: { date: "2026-10-06", start: "", end: "" } },
        })
      ).status(),
    ).toBe(409);
    expect((await member.delete(`/api/records/time/${row.id}`)).status()).toBe(409);
    expect(
      (
        await admin.post("/api/actions", {
          data: {
            action: "timesheet-decide",
            id: sheet.id,
            data: { status: "changes_requested", note: "QA Korrektur" },
          },
        })
      ).status(),
    ).toBe(200);
    const leave = await member.post("/api/records/leave", {
      data: { data: { start: "2026-12-21", end: "2026-12-21", reason: "QA" } },
    });
    expect(leave.status(), await leave.text()).toBe(201);
    const leaveRow = await leave.json();
    created.push({ kind: "leave", id: leaveRow.id });
    expect(
      (
        await member.post("/api/actions", {
          data: { action: "leave-decide", id: leaveRow.id, data: { status: "approved" } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "leave-decide", id: leaveRow.id, data: { status: "approved" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "leave-decide", id: leaveRow.id, data: { status: "rejected" } },
        })
      ).status(),
    ).toBe(200);
    const token = await (
      await member.post("/api/actions", { data: { action: "calendar-token" } })
    ).json();
    expect((await admin.get(token.url)).status()).toBe(200);
    await member.post("/api/actions", {
      data: { action: "calendar-token", data: { revoke: true } },
    });
    expect((await admin.get(token.url)).status()).toBe(404);
  } finally {
    for (const item of created.reverse())
      await admin.delete(`/api/records/${item.kind}/${item.id}`);
    if (memberId)
      await admin.post("/api/actions", {
        data: { action: "member-update", id: memberId, data: { status: "disabled" } },
      });
    await admin.dispose();
    await member.dispose();
  }
});
