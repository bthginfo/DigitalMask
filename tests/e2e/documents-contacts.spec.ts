import { test, expect, request as playwrightRequest } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { qaResources, trackQaResources } from "./qa-resources";

test("reusable people, free-text casting, structured documents and domain categories", async () => {
  test.setTimeout(120000);
  const credentials = await readFile(".local/ADMIN-ZUGANG.txt", "utf8");
  const admin = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const member = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  });
  const created = qaResources();
  const suffix = Date.now();
  let memberId = "";
  const create = async (kind: string, data: Record<string, unknown>) => {
    const response = await admin.post(`/api/records/${kind}`, { data: { data } });
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    created.push({ kind, id: result.id });
    return result;
  };
  try {
    expect(
      (
        await admin.post("/api/login", {
          data: {
            username: credentials.match(/Benutzername: (.+)/)![1],
            password: credentials.match(/Passwort: (.+)/)![1],
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.post("/api/register", {
          data: {
            name: "QA Teammitglied",
            username: `qa_${suffix}`,
            password: "QA-long-password-2026",
          },
        })
      ).status(),
    ).toBe(201);
    const workspace = await (await admin.get("/api/workspace")).json();
    memberId = workspace.members.find(
      (person: { username: string }) => person.username === `qa_${suffix}`,
    ).id;
    trackQaResources({ kind: "member", id: memberId });
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
          data: { username: `qa_${suffix}`, password: "QA-long-password-2026" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.post("/api/records/people", { data: { data: { name: "Unberechtigt" } } })
      ).status(),
    ).toBe(403);
    const person = await create("people", {
      name: `QA Regie ${suffix}`,
      organization: "QA Theater",
      position: "Regie",
      email: "qa@example.invalid",
      phone: "+49 000 123",
      notes: "Nur Test",
    });
    const category = await create("categories", {
      scope: "looks",
      key: `qa-style-${suffix}`,
      name: "QA Zusatz",
      order: 7,
    });
    const materialCategory = await create("categories", {
      scope: "materials",
      key: `qa-stock-${suffix}`,
      name: "QA Fundus",
    });
    const project = await create("productions", {
      title: `QA Historische Produktion ${suffix}`,
      season: "2021/22",
      premiere: "2021-11-05",
      durationMinutes: 95,
      contacts: [
        { id: "direction", role: "Regie", type: "external", name: "", personId: person.id },
        { id: "makeup", role: "Maskenbetreuung", type: "makeup", memberId },
      ],
    });
    expect(project.data.contacts[0]).toMatchObject({ personId: person.id, name: person.data.name });
    expect(project.data.memberIds).toEqual([memberId]);
    expect((await admin.delete(`/api/records/people/${person.id}`)).status()).toBe(409);
    const renamed = await admin.patch(`/api/records/people/${person.id}`, {
      data: { version: person.version, data: { name: `QA Neue Regie ${suffix}` } },
    });
    expect(renamed.status(), await renamed.text()).toBe(200);
    const second = await create("productions", {
      title: `QA Weitere Produktion ${suffix}`,
      contacts: [
        { id: "direction", role: "Künstlerische Leitung", type: "external", personId: person.id },
      ],
    });
    expect(second.data.contacts[0].name).toBe(`QA Neue Regie ${suffix}`);
    const freePersonResponse = await admin.post("/api/records/productions", {
      data: {
        data: {
          title: `QA Freier Kontakt ${suffix}`,
          contacts: [
            { id: "guest", role: "Gastassistenz", type: "makeup", name: `QA Gast ${suffix}` },
          ],
        },
      },
    });
    expect(freePersonResponse.status()).toBe(201);
    const freeProject = await freePersonResponse.json();
    const freePersonId = freeProject.data.contacts[0].personId;
    expect(freePersonId).toBeTruthy();
    created.push({ kind: "people", id: freePersonId }, { kind: "productions", id: freeProject.id });
    const editedFreeProject = await admin.patch(`/api/records/productions/${freeProject.id}`, {
      data: {
        version: freeProject.version,
        data: {
          contacts: [
            {
              id: "guest",
              role: "Neue Gastrolle",
              type: "makeup",
              name: `QA Gast ${suffix}`,
              memberId: "",
            },
          ],
        },
      },
    });
    expect(editedFreeProject.status()).toBe(200);
    expect((await editedFreeProject.json()).data.contacts[0].personId).toBe(freePersonId);
    const actor = await create("actors", { name: `QA Schauspiel ${suffix}` });
    const figure = await create("characters", { name: "QA Figur", productionId: project.id });
    const casting = await create("casting", {
      productionId: project.id,
      actorName: "QA Freier Schauspielname",
      characterName: "QA Freie Figur",
    });
    expect(casting.data.actorId).toBe("");
    const assigned = await create("casting", {
      productionId: project.id,
      actorId: actor.id,
      characterId: figure.id,
    });
    expect(assigned.data.actorName).toBe(actor.data.name);
    expect(
      (
        await admin.post("/api/records/casting", {
          data: { data: { productionId: project.id, actorName: "Nur Name" } },
        })
      ).status(),
    ).toBe(400);
    const look = await create("looks", {
      productionId: project.id,
      actorId: actor.id,
      characterId: figure.id,
      sections: [
        { key: "preparation", entries: [{ id: "p", text: "Bereitlegen" }] },
        {
          key: "makeup",
          entries: [
            { id: "m1", text: "Grundieren" },
            { id: "m2", label: "Augen", text: "Schattieren" },
          ],
        },
        { key: category.data.key, entries: [{ id: "extra", text: "QA Zusatztext" }] },
      ],
    });
    expect(look.data.title).toBe(actor.data.name);
    expect(look.data.status).toBe("published");
    expect(look.data.sections[1].entries).toHaveLength(2);
    const visible = await (await member.get("/api/workspace")).json();
    expect(visible.records.looks.some((entry: { id: string }) => entry.id === look.id)).toBe(true);
    expect(visible.records.people.some((entry: { id: string }) => entry.id === person.id)).toBe(
      true,
    );
    expect((await admin.delete(`/api/records/categories/${category.id}`)).status()).toBe(409);
    await create("materials", {
      name: `QA Material ${suffix}`,
      category: materialCategory.data.key,
    });
    expect((await admin.delete(`/api/records/categories/${materialCategory.id}`)).status()).toBe(
      409,
    );
    expect(
      (
        await admin.post("/api/records/materials", {
          data: { data: { name: "Ungültig", category: "no-category" } },
        })
      ).status(),
    ).toBe(400);
    const handover = await create("handovers", {
      title: `QA Allgemeiner Dienst ${suffix}`,
      productionId: project.id,
      sections: [
        {
          key: "care",
          entries: [
            { id: "care-1", text: "Nicht übersehen" },
            { id: "care-2", text: "Pinsel reinigen" },
          ],
        },
      ],
      checklist: [
        { text: "Licht aus", done: false },
        { text: "Tür zu", done: true },
      ],
    });
    expect(handover.data.productionId).toBe("");
    expect(handover.data.date).toBe("");
    const oldYear = await admin.get(
      `/api/export?kind=looks&format=json&year=2021&season=2021%2F22&id=${look.id}`,
    );
    expect(oldYear.status(), await oldYear.text()).toBe(200);
    expect((await oldYear.json()).records.map((entry: { id: string }) => entry.id)).toEqual([
      look.id,
    ]);
    const wrongYear = await admin.get(`/api/export?kind=looks&format=json&year=2026&id=${look.id}`);
    expect((await wrongYear.json()).records).toEqual([]);
    const generalFolder = await admin.get(
      `/api/export?kind=looks&format=json&generalOnly=true&id=${look.id}`,
    );
    expect(generalFolder.status()).toBe(200);
    expect((await generalFolder.json()).records).toEqual([]);
    const peopleExport = await admin.get(`/api/export?kind=people&format=csv&id=${person.id}`);
    expect(await peopleExport.text()).toContain("qa@example.invalid");
    const productionExport = await admin.get(
      `/api/export?kind=productions&format=csv&id=${project.id}`,
    );
    expect(await productionExport.text()).toContain(`QA Neue Regie ${suffix}`);
  } finally {
    // Retry dependency-safe cleanup because contacts are shared across productions.
    for (const item of created.reverse())
      await admin.delete(`/api/records/${item.kind}/${item.id}`);
    if (memberId)
      await admin.post("/api/actions", {
        data: { action: "member-update", id: memberId, data: { status: "disabled" } },
      });
    await member.dispose();
    await admin.dispose();
  }
});
