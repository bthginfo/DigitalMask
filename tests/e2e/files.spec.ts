import { test, expect, request as playwrightRequest } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test("private images, printable look sheets and copied production assets", async () => {
  test.setTimeout(120000);
  const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  const admin = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const anonymous = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const created: { kind: string; id: string }[] = [];
  const create = async (kind: string, data: Record<string, unknown>) => {
    const response = await admin.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const row = await response.json();
    created.push({ kind, id: row.id });
    return row;
  };
  try {
    const login = await admin.post("/api/login", {
      data: {
        username: credentials.match(/Benutzername: (.+)/)![1],
        password: credentials.match(/Passwort: (.+)/)![1],
      },
    });
    expect(login.status()).toBe(200);
    const project = await create("productions", {
      title: `QA Dateien ${Date.now()}`,
    });
    const actor = await create("actors", { name: "QA Galerie Schauspieler" });
    const character = await create("characters", {
      name: "QA Galerie Figur",
      productionId: project.id,
    });
    const casting = await create("casting", {
      productionId: project.id,
      characterId: character.id,
      actorId: actor.id,
    });
    const look = await create("looks", {
      title: "QA Aufschrieb",
      productionId: project.id,
      steps: "Perücke vorbereiten",
      status: "draft",
    });
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#16735c" },
    })
      .png()
      .toBuffer();
    const upload = await admin.post("/api/files", {
      multipart: {
        recordKind: "looks",
        recordId: look.id,
        file: { name: "qa-image.png", mimeType: "image/png", buffer: png },
      },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const asset = await upload.json();
    const castingImageIds: string[] = [];
    for (const [recordKind, recordId] of [
      ["characters", character.id],
      ["casting", casting.id],
      ["casting", casting.id],
    ]) {
      const response = await admin.post("/api/files", {
        multipart: {
          recordKind,
          recordId,
          file: { name: "qa-gallery.png", mimeType: "image/png", buffer: png },
        },
      });
      expect(response.status(), await response.text()).toBe(201);
      const image = await response.json();
      if (recordKind === "casting") castingImageIds.push(image.id);
    }
    const galleryWorkspace = await (await admin.get("/api/workspace")).json();
    const currentCasting = galleryWorkspace.records.casting.find(
      (row: { id: string }) => row.id === casting.id,
    );
    expect(currentCasting.data.imageIds).toEqual(castingImageIds);
    const galleryEdit = await admin.patch(`/api/records/casting/${casting.id}`, {
      data: { version: currentCasting.version, data: { alternate: true } },
    });
    expect(galleryEdit.status()).toBe(200);
    expect((await galleryEdit.json()).data.imageIds).toEqual(castingImageIds);
    const castingPdf = await admin.get(`/api/export?kind=casting&format=pdf&id=${casting.id}`);
    expect(castingPdf.status(), castingPdf.status() !== 200 ? await castingPdf.text() : "").toBe(
      200,
    );
    expect((await castingPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await anonymous.get(`/api/files/${asset.id}`)).status()).toBe(401);
    const image = await admin.get(`/api/files/${asset.id}`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/webp");
    const history = await admin.get(`/api/history?id=${look.id}`);
    expect(history.status()).toBe(200);
    expect((await history.json()).versions.length).toBeGreaterThan(0);
    const pdf = await admin.get(`/api/export?kind=looks&format=pdf&id=${look.id}`);
    expect(pdf.status(), pdf.status() !== 200 ? await pdf.text() : "").toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const copy = await admin.post("/api/actions", {
      data: { action: "production-copy", id: project.id, data: { title: "QA Wiederaufnahme" } },
    });
    expect(copy.status(), await copy.text()).toBe(200);
    const copiedProject = await copy.json();
    created.push({ kind: "productions", id: copiedProject.id });
    const workspace = await (await admin.get("/api/workspace")).json();
    const copiedLook = workspace.records.looks.find(
      (r: { data: { productionId: string } }) => r.data.productionId === copiedProject.id,
    );
    expect(copiedLook.data.status).toBe("draft");
    for (const kind of ["characters", "casting", "looks"]) {
      for (const child of workspace.records[kind].filter(
        (row: { data: { productionId: string } }) => row.data.productionId === copiedProject.id,
      ))
        created.push({ kind, id: child.id });
    }
    const copiedCasting = workspace.records.casting.find(
      (row: { data: { productionId: string } }) => row.data.productionId === copiedProject.id,
    );
    expect(copiedCasting.data.imageIds).toHaveLength(2);
    for (const id of copiedCasting.data.imageIds)
      expect((await admin.get(`/api/files/${id}`)).status()).toBe(200);
    const copiedFile = workspace.records.files.find(
      (r: { data: { recordId: string } }) => r.data.recordId === copiedLook.id,
    );
    expect((await admin.delete(`/api/files/${asset.id}`)).status()).toBe(200);
    expect((await admin.get(`/api/files/${copiedFile.id}`)).status()).toBe(200);
    const edited = await admin.patch(`/api/records/looks/${look.id}`, {
      data: { version: look.version, data: { steps: "Veraltete Fassung" } },
    });
    expect(edited.status()).toBe(409);
  } finally {
    for (const item of created.reverse())
      await admin.delete(`/api/records/${item.kind}/${item.id}`);
    await admin.dispose();
    await anonymous.dispose();
  }
});
