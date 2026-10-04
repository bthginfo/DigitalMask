/* Fictional workspace used only by the localhost recorder. No production imports. */
(() => {
  const demo = window.__DM_DEMO;
  if (!demo) throw new Error("Load demo-init.js before workflow-demo.js");
  const { workspace } = demo;
  let sequence = 0;
  const record = (kind, data, id = `demo-${kind}-${++sequence}`) => ({
    id,
    kind,
    data,
    organizationId: workspace.organization.id,
    departmentId: workspace.department.id,
    createdBy: workspace.user.id,
    version: 1,
    createdAt: "2026-10-04T08:00:00Z",
    updatedAt: "2026-10-04T08:00:00Z",
  });
  const add = (kind, data, id) => {
    const row = record(kind, data, id);
    workspace.records[kind].push(row);
    return row;
  };
  add(
    "productions",
    {
      title: "Der kleine Bühnenzauber",
      season: "2026/2027",
      status: "preparation",
      premiere: "2026-10-24",
      color: "#7b65a3",
      memberIds: ["demo-mara", "demo-nora"],
      contacts: [
        {
          id: "demo-contact",
          type: "makeup",
          role: "Maskenbetreuung",
          memberId: "demo-mara",
          name: "Mara Beispiel",
        },
      ],
      description: "Ein erfundenes Stück für die Videoanleitung.",
      productionDurationMinutes: 90,
    },
    "demo-production",
  );
  add(
    "actors",
    {
      name: "Alex Bühne",
      ensembleSeasons: ["2026/2027"],
      hair: "Braun, schulterlang",
      headCircumference: "56 cm",
    },
    "demo-actor",
  );
  add("characters", { name: "Die Erzählerin", productionId: "demo-production" }, "demo-character");
  add(
    "casting",
    {
      productionId: "demo-production",
      actorId: "demo-actor",
      characterId: "demo-character",
      imageIds: [],
    },
    "demo-casting",
  );
  add(
    "sprints",
    {
      title: "Vorbereitung Premiere",
      productionId: "demo-production",
      start: "2026-10-01",
      end: "2026-10-24",
      status: "active",
    },
    "demo-sprint",
  );
  add(
    "tasks",
    {
      title: "Perücke vorbereiten",
      description: "Frisieren und Sitz prüfen.",
      productionId: "demo-production",
      sprintId: "demo-sprint",
      assigneeIds: ["demo-mara"],
      status: "todo",
      priority: "normal",
      checklist: [{ text: "Sitz prüfen", done: false }],
    },
    "demo-task",
  );
  for (const [key, name, color] of [
    ["production", "Produktion", "#377a68"],
    ["office", "Büro", "#537fba"],
    ["cleaning", "Aufräumen", "#ac8235"],
    ["other", "Sonstiges", "#77818e"],
  ])
    add("categories", { scope: "time", key, name, color, order: sequence });
  for (const [key, name] of [
    ["preparation", "Vorbereitung"],
    ["makeup", "Makeup"],
    ["hair", "Haare"],
    ["wigs-beards", "Perücken und Bärte"],
    ["changeover", "Umbau & Wechsel"],
    ["setup", "Einrichten"],
  ])
    add("categories", { scope: "looks", key, name, color: "#377a68", order: sequence });
  for (const [person, day, category, title] of [
    ["demo-mara", "04", "preparation", "Perücken vorbereiten"],
    ["demo-nora", "05", "rehearsal", "AMA"],
    ["demo-mara", "07", "performance", "Vorstellung"],
  ])
    add("events", {
      title,
      participantIds: [person],
      start: `2026-10-${day}T09:00:00+02:00`,
      end: `2026-10-${day}T12:00:00+02:00`,
      category,
      productionId: "demo-production",
      recurrence: "none",
      allDay: false,
    });
  add(
    "maskPlans",
    {
      productionId: "demo-production",
      title: "AMA · Premiere",
      notes: "Beispielablauf",
      windowMinutes: 60,
      stepMinutes: 5,
      lanes: [
        {
          id: "aa000000-0000-4000-8000-000000000001",
          label: "Platz 1",
          memberIds: ["demo-mara", "demo-nora"],
          staffNames: [],
        },
      ],
      blocks: [],
    },
    "demo-plan",
  );
  const response = (body) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const match = url.pathname.match(/^\/api\/records\/([^/]+)(?:\/([^/]+))?$/);
    if (match && ["POST", "PATCH"].includes(init.method)) {
      const kind = match[1];
      if (!workspace.records[kind]) throw new Error("Unknown fictional record kind");
      let data = JSON.parse(init.body).data;
      if (kind === "time")
        data = {
          ...data,
          userId: workspace.user.id,
          dayAllocations: [{ date: data.date, seconds: data.durationSeconds }],
        };
      if (kind === "messages") data = { ...data, userId: workspace.user.id };
      let row;
      if (match[2]) {
        row = workspace.records[kind].find((candidate) => candidate.id === match[2]);
        if (!row) throw new Error("Unknown fictional record");
        row.data = { ...row.data, ...data };
        row.version++;
      } else row = add(kind, data);
      demo.writes.push({ kind, data: row.data });
      return response(row);
    }
    if (url.pathname === "/api/files" && init.method === "POST") {
      const file = init.body.get("file");
      const row = add(
        "files",
        {
          name: file.name,
          mime: file.type,
          size: file.size,
          recordKind: init.body.get("recordKind"),
          recordId: init.body.get("recordId"),
        },
        `demo-file-${++sequence}`,
      );
      demo.writes.push({ kind: "files", data: row.data });
      return response(row);
    }
    if (url.pathname === "/api/chat") return response({ messages: workspace.records.messages });
    if (url.pathname === "/api/actions") return response({});
    return previousFetch(input, init);
  };
})();
