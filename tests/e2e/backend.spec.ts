import { qaResources, trackQaResources } from "./qa-resources";
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
  const created = qaResources();
  let memberId = "";
  const create = async (kind: string, data: Record<string, unknown>) => {
    const response = await admin.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    if (kind === "productions")
      for (const contact of result.data.contacts || [])
        if (contact.personId) created.push({ kind: "people", id: contact.personId });
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
    trackQaResources({ kind: "member", id: memberId });
    const inactiveContact = await admin.post("/api/records/productions", {
      data: {
        data: {
          title: "QA unzulässige Maskenperson",
          contacts: [{ id: "makeup", role: "Maskenbetreuung", type: "makeup", name: "", memberId }],
        },
      },
    });
    expect(inactiveContact.status()).toBe(400);
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
    const originalProfile = (await (await member.get("/api/workspace")).json()).user.preferences;
    expect(originalProfile).toEqual({ accentPalette: "green", onboardingVersion: 0 });
    expect(
      (
        await member.post("/api/actions", {
          data: { action: "profile-update", data: { accentPalette: "lavender" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.post("/api/actions", {
          data: { action: "profile-update", data: { onboardingCompleted: true } },
        })
      ).status(),
    ).toBe(200);
    expect((await (await member.get("/api/workspace")).json()).user.preferences).toEqual({
      accentPalette: "lavender",
      onboardingVersion: 1,
    });
    expect(
      (
        await member.post("/api/actions", {
          data: { action: "profile-update", data: { accentPalette: "invalid" } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await member.post("/api/actions", {
          data: {
            action: "profile-update",
            data: { userId: workspace.user.id, accentPalette: "rose" },
          },
        })
      ).status(),
    ).toBe(400);
    const ownFeedbackResponse = await member.post("/api/records/feedback", {
      data: {
        data: {
          type: "feature",
          title: `QA Feedback ${suffix}`,
          description: "QA Beschreibung",
          status: "done",
          userId: workspace.user.id,
        },
      },
    });
    expect(ownFeedbackResponse.status()).toBe(201);
    const ownFeedback = await ownFeedbackResponse.json();
    created.push({ kind: "feedback", id: ownFeedback.id });
    expect(ownFeedback.data.userId).toBe(memberId);
    expect(ownFeedback.data.status).toBe("new");
    const privateFeedback = await create("feedback", { type: "bug", title: `QA Privat ${suffix}` });
    expect(
      (await (await member.get("/api/workspace")).json()).records.feedback.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual([ownFeedback.id]);
    expect(
      (
        await member.patch(`/api/records/feedback/${privateFeedback.id}`, {
          data: { version: privateFeedback.version, data: { title: "Unzulässig" } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin.patch(`/api/records/feedback/${ownFeedback.id}`, {
          data: { version: ownFeedback.version, data: { status: "planned" } },
        })
      ).status(),
    ).toBe(200);
    const reviewed = (await (await member.get("/api/workspace")).json()).records.feedback[0];
    expect(
      (
        await member.patch(`/api/records/feedback/${ownFeedback.id}`, {
          data: { version: reviewed.version, data: { status: "done", description: "QA ergänzt" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await member.get("/api/workspace")).json()).records.feedback[0].data.status,
    ).toBe("planned");
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { role: "admin" } },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await member.get("/api/workspace")).json()).records.feedback.some(
        (row: { id: string }) => row.id === privateFeedback.id,
      ),
    ).toBe(false);
    expect(
      (
        await member.post("/api/login", {
          data: { username: name, password: "QA-long-password-2026" },
        })
      ).status(),
    ).toBe(200);
    expect((await member.delete(`/api/records/feedback/${privateFeedback.id}`)).status()).toBe(403);
    expect(
      (
        await admin.post("/api/actions", {
          data: { action: "member-update", id: memberId, data: { role: "user" } },
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
      contacts: [
        {
          id: "direction",
          role: "Regie",
          type: "external",
          name: "QA Externe Regie",
          memberId: "",
        },
        {
          id: "custom",
          role: "Choreografie",
          type: "external",
          name: "QA Externer Kontakt",
          memberId: "",
        },
        { id: "makeup", role: "Maskenbetreuung", type: "makeup", name: "", memberId },
        {
          id: "guest",
          role: "Maskenassistenz",
          type: "makeup",
          name: "QA Gastassistenz",
          memberId: "",
        },
      ],
    });
    expect(production.data.memberIds).toEqual([memberId]);
    const memberWorkspace = await (await member.get("/api/workspace")).json();
    expect(
      memberWorkspace.records.productions.some((row: { id: string }) => row.id === production.id),
    ).toBe(true);
    const expandedTeam = await admin.patch(`/api/records/productions/${production.id}`, {
      data: { version: production.version, data: { memberIds: [memberId, workspace.user.id] } },
    });
    expect(expandedTeam.status()).toBe(400);
    const preservedContacts = await admin.patch(`/api/records/productions/${production.id}`, {
      data: { version: production.version, data: { description: "QA überarbeitet" } },
    });
    expect(preservedContacts.status()).toBe(200);
    expect((await preservedContacts.json()).data.contacts).toEqual(production.data.contacts);
    const contactsExport = await admin.get(
      `/api/export?kind=productions&format=csv&id=${production.id}`,
    );
    expect(await contactsExport.text()).toContain("QA Externe Regie");
    const forbidden = await member.post("/api/records/productions", {
      data: { data: { title: "Verbotene Produktion" } },
    });
    expect(forbidden.status()).toBe(403);
    const task = await create("tasks", {
      title: "QA Perücke vorbereiten",
      productionId: production.id,
      assigneeIds: [memberId],
    });
    const teamTask = await create("tasks", {
      title: `QA Teamboard ${suffix}`,
      assigneeIds: [memberId],
    });
    expect(teamTask.data.productionId).toBe("");
    const teamCsv = await admin.get("/api/export?kind=tasks&format=csv&teamOnly=true");
    const teamCsvText = await teamCsv.text();
    expect(teamCsv.status()).toBe(200);
    expect(teamCsvText).toContain(teamTask.data.title);
    expect(teamCsvText).not.toContain(task.data.title);
    const productionCsv = await admin.get(
      `/api/export?kind=tasks&format=csv&productionId=${production.id}`,
    );
    const productionCsvText = await productionCsv.text();
    expect(productionCsvText).toContain(task.data.title);
    expect(productionCsvText).not.toContain(teamTask.data.title);
    expect(
      (
        await admin.get(
          `/api/export?kind=tasks&format=csv&productionId=${production.id}&teamOnly=true`,
        )
      ).status(),
    ).toBe(400);
    const sprint = await create("sprints", {
      title: "QA Produktionssprint",
      productionId: production.id,
      start: "2026-09-30",
      end: "2026-10-14",
    });
    expect(
      (
        await admin.post("/api/records/tasks", {
          data: { data: { title: "QA falscher Teamsprint", sprintId: sprint.id } },
        })
      ).status(),
    ).toBe(400);
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
    const attendanceData = {
      title: "QA Anwesenheit",
      date: "2026-09-29",
      start: "2026-09-29T09:00:00+02:00",
      end: "2026-09-29T18:00:00+02:00",
      durationSeconds: 1,
      pauseSeconds: 1800,
      idempotencyKey: `qa:attendance:${suffix}`,
    };
    const attendanceResponse = await member.post("/api/records/attendance", {
      data: { data: { ...attendanceData, productionId: production.id, userId: workspace.user.id } },
    });
    expect(attendanceResponse.status(), await attendanceResponse.text()).toBe(201);
    const attendance = await attendanceResponse.json();
    created.push({ kind: "attendance", id: attendance.id });
    expect(attendance.data.durationSeconds).toBe(30600);
    expect(attendance.data.userId).toBe(memberId);
    expect(attendance.data.productionId).toBeUndefined();
    expect(
      (
        await (
          await member.post("/api/records/attendance", { data: { data: attendanceData } })
        ).json()
      ).id,
    ).toBe(attendance.id);
    expect(
      (
        await member.post("/api/records/attendance", {
          data: { data: { ...attendanceData, idempotencyKey: "", title: "QA Überschneidung" } },
        })
      ).status(),
    ).toBe(409);
    const correctedAttendance = await member.patch(`/api/records/attendance/${attendance.id}`, {
      data: { version: attendance.version, data: { end: "2026-09-29T17:00:00+02:00" } },
    });
    expect(correctedAttendance.status()).toBe(200);
    expect((await correctedAttendance.json()).data.durationSeconds).toBe(27000);
    expect((await (await member.get("/api/workspace")).json()).projectHours[production.id]).toBe(
      3600,
    );
    expect(
      (
        await member.post("/api/actions", {
          data: {
            action: "timer-start",
            data: { title: "QA Parallelproduktion", productionId: production.id },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await member.post("/api/actions", { data: { action: "attendance-timer-start" } })).status(),
    ).toBe(200);
    const bothTimers = await (await member.get("/api/workspace")).json();
    expect(bothTimers.timer).not.toBeNull();
    expect(bothTimers.attendanceTimer).not.toBeNull();
    expect(
      (await member.post("/api/actions", { data: { action: "attendance-timer-start" } })).status(),
    ).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    for (const action of ["timer-stop", "attendance-timer-stop"]) {
      const stoppedResponse = await member.post("/api/actions", { data: { action } });
      expect(stoppedResponse.status(), await stoppedResponse.text()).toBe(200);
      const stopped = await stoppedResponse.json();
      created.push({ kind: stopped.kind, id: stopped.id });
      expect(stopped.data.durationSeconds).toBeGreaterThan(0);
      expect(
        (
          await member.patch(`/api/records/${stopped.kind}/${stopped.id}`, {
            data: { version: stopped.version, data: { title: "QA Timer korrigiert" } },
          })
        ).status(),
      ).toBe(200);
    }
    const noTimers = await (await member.get("/api/workspace")).json();
    expect(noTimers.timer).toBeNull();
    expect(noTimers.attendanceTimer).toBeNull();
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
    await member.post("/api/actions", { data: { action: "timer-discard" } });
    await member.post("/api/actions", { data: { action: "attendance-timer-discard" } });
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
