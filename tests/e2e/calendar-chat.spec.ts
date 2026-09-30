import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test("calendar category lifecycle and private chat/file permissions", async () => {
  test.setTimeout(120000);
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
  const root = await playwrightRequest.newContext({ baseURL });
  const a = await playwrightRequest.newContext({ baseURL });
  const b = await playwrightRequest.newContext({ baseURL });
  const suffix = Date.now();
  const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  const ids: string[] = [];
  const created: { client: APIRequestContext; kind: string; id: string }[] = [];
  const create = async (client: APIRequestContext, kind: string, data: Record<string, unknown>) => {
    const response = await client.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const row = await response.json();
    created.push({ client, kind, id: row.id });
    return row;
  };
  try {
    expect(
      (
        await root.post("/api/login", {
          data: {
            username: credentials.match(/Benutzername: (.+)/)![1],
            password: credentials.match(/Passwort: (.+)/)![1],
          },
        })
      ).status(),
    ).toBe(200);
    for (const [index, client] of [a, b].entries()) {
      const username = `qa_${suffix + index}`;
      const response = await client.post("/api/register", {
        data: { name: "QA Teammitglied", username, password: "QA-long-password-2026" },
      });
      expect(response.status()).toBe(201);
      const workspace = await (await root.get("/api/workspace")).json();
      const id = workspace.members.find(
        (member: { username: string }) => member.username === username,
      ).id;
      ids.push(id);
      expect(
        (
          await root.post("/api/actions", {
            data: {
              action: "member-update",
              id,
              data: { status: "active", ...(index === 1 ? { role: "admin" } : {}) },
            },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await client.post("/api/login", { data: { username, password: "QA-long-password-2026" } })
        ).status(),
      ).toBe(200);
    }
    const defaults = (await (await root.get("/api/workspace")).json()).records.calendarCategories;
    for (const key of ["sick", "abf", "rest", "half-day-off", "vacation"])
      expect(
        defaults.find((row: { data: { key: string } }) => row.data.key === key)?.data.allDay,
      ).toBe(true);
    expect(
      (
        await a.post("/api/records/calendarCategories", {
          data: { data: { key: `qa-${suffix}`, name: "QA Kategorie", color: "#527894" } },
        })
      ).status(),
    ).toBe(403);
    const category = await create(root, "calendarCategories", {
      key: `qa-${suffix}`,
      name: "QA Kategorie",
      color: "#527894",
      allDay: true,
    });
    const event = await create(root, "events", {
      category: category.data.key,
      title: "",
      start: "2026-11-01T08:00:00+01:00",
      end: "2026-11-02T18:00:00+01:00",
      participantIds: [ids[0]],
    });
    expect(event.data.title).toBe("");
    expect(event.data.allDay).toBe(true);
    expect(event.data.start).toBe("2026-10-31T23:00:00.000Z");
    expect(event.data.end).toBe("2026-11-01T23:00:00.000Z");
    expect((await root.delete(`/api/records/calendarCategories/${category.id}`)).status()).toBe(
      409,
    );
    expect(
      (
        await root.patch(`/api/records/calendarCategories/${category.id}`, {
          data: { version: category.version, data: { allDay: false } },
        })
      ).status(),
    ).toBe(409);
    const renamed = await root.patch(`/api/records/calendarCategories/${category.id}`, {
      data: {
        version: category.version,
        data: { name: "QA Neuer Kategorienname", color: "#875497" },
      },
    });
    expect(renamed.status()).toBe(200);
    const ics = await root.get(`/api/export?kind=events&format=ics&id=${event.id}`);
    expect(ics.status()).toBe(200);
    expect(await ics.text()).toContain("DTSTART;VALUE=DATE:20261101");
    expect(await ics.text()).toContain("SUMMARY:QA Neuer Kategorienname");
    expect((await root.delete(`/api/records/events/${event.id}`)).status()).toBe(200);
    expect((await root.delete(`/api/records/calendarCategories/${category.id}`)).status()).toBe(
      200,
    );
    expect(
      (await (await root.get("/api/workspace")).json()).records.calendarCategories.some(
        (row: { id: string }) => row.id === category.id,
      ),
    ).toBe(false);

    const direct = await create(a, "conversations", {
      mode: "direct",
      participantIds: [ids[0], ids[1]],
    });
    const duplicate = await a.post("/api/records/conversations", {
      data: { data: { mode: "direct", participantIds: [ids[1], ids[0]] } },
    });
    expect((await duplicate.json()).id).toBe(direct.id);
    const privateMessage = await create(a, "messages", {
      text: "QA Private Direktnachricht",
      conversationId: direct.id,
    });
    expect((await root.get(`/api/messages?conversationId=${direct.id}`)).status()).toBe(403);
    expect(
      (
        await root.post("/api/records/messages", {
          data: { data: { text: "Unzulässig", conversationId: direct.id } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await root.get(`/api/export?kind=messages&format=json&conversationId=${direct.id}`)
      ).status(),
    ).toBe(403);
    expect(
      (await (await root.get("/api/workspace")).json()).records.messages.some(
        (row: { id: string }) => row.id === privateMessage.id,
      ),
    ).toBe(false);
    expect(
      (await (await b.get(`/api/messages?conversationId=${direct.id}`)).json()).messages.map(
        (row: { id: string }) => row.id,
      ),
    ).toContain(privateMessage.id);
    expect(
      (await (await b.get("/api/messages")).json()).messages.some(
        (row: { id: string }) => row.id === privateMessage.id,
      ),
    ).toBe(false);
    expect(
      (
        await b.patch(`/api/records/messages/${privateMessage.id}`, {
          data: { version: privateMessage.version, data: { text: "Unzulässig" } },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.patch(`/api/records/messages/${privateMessage.id}`, {
          data: { version: privateMessage.version, data: { conversationId: "" } },
        })
      ).status(),
    ).toBe(400);

    const rootId = (await (await root.get("/api/workspace")).json()).user.id;
    const group = await create(root, "conversations", {
      mode: "group",
      title: "QA Privater Gruppenchat",
      participantIds: [rootId, ids[0]],
    });
    const groupMessage = await create(root, "messages", {
      text: "QA Privates Bild",
      conversationId: group.id,
    });
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#527894" },
    })
      .png()
      .toBuffer();
    const upload = await root.post("/api/files", {
      multipart: {
        recordKind: "messages",
        recordId: groupMessage.id,
        file: { name: "qa-private.png", mimeType: "image/png", buffer: png },
      },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const file = await upload.json();
    expect((await a.get(`/api/files/${file.id}`)).status()).toBe(200);
    expect((await b.get(`/api/files/${file.id}`)).status()).toBe(403);
    expect(
      (await (await b.get("/api/workspace")).json()).records.files.some(
        (row: { id: string }) => row.id === file.id,
      ),
    ).toBe(false);
    expect(
      (
        await root.post("/api/records/messages", {
          data: { data: { text: "QA Unzulässige Weitergabe", attachmentIds: [file.id] } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await root.patch(`/api/records/conversations/${group.id}`, {
          data: { version: group.version, data: { participantIds: [rootId, ids[1]] } },
        })
      ).status(),
    ).toBe(200);
    expect((await a.get(`/api/files/${file.id}`)).status()).toBe(403);
    expect((await a.get(`/api/messages?conversationId=${group.id}`)).status()).toBe(403);
    expect((await b.get(`/api/files/${file.id}`)).status()).toBe(200);
  } finally {
    for (const row of created.reverse())
      await row.client.delete(`/api/records/${row.kind}/${row.id}`);
    for (const id of ids)
      await root.post("/api/actions", {
        data: { action: "member-update", id, data: { status: "disabled" } },
      });
    await Promise.all([root.dispose(), a.dispose(), b.dispose()]);
  }
});
