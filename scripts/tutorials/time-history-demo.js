/* Fictional prior weeks for the localhost time tutorial. Never imported by the app. */
(() => {
  const demo = window.__DM_DEMO;
  if (!demo) throw new Error("Load the workspace tutorial fixtures first");
  const { workspace } = demo;
  const add = (kind, id, data) => {
    workspace.records[kind].push({
      id,
      kind,
      data,
      organizationId: workspace.organization.id,
      departmentId: workspace.department.id,
      createdBy: workspace.user.id,
      version: 1,
      createdAt: "2026-09-27T08:00:00Z",
      updatedAt: "2026-09-27T08:00:00Z",
    });
  };
  add("attendance", "demo-history-attendance", {
    userId: workspace.user.id,
    title: "Anwesenheit im Theater",
    date: "2026-09-22",
    start: "2026-09-22T09:00:00+02:00",
    end: "2026-09-22T13:00:00+02:00",
    durationSeconds: 14400,
    pauseSeconds: 0,
    dayAllocations: [{ date: "2026-09-22", seconds: 14400 }],
  });
  for (const [date, until, category, title] of [
    ["2026-09-21", "2026-09-22", "abf", "ABF"],
    ["2026-09-26", "2026-09-27", "rest", "Ruhetag"],
  ]) {
    add("events", `demo-history-${category}`, {
      title,
      category,
      allDay: true,
      start: `${date}T00:00:00+02:00`,
      end: `${until}T00:00:00+02:00`,
      participantIds: [workspace.user.id],
      recurrence: "none",
    });
  }
  add("events", "demo-history-planned-work", {
    title: "Perücke frisieren",
    category: "preparation",
    productionId: "demo-production",
    start: "2026-09-24T09:00:00+02:00",
    end: "2026-09-24T12:00:00+02:00",
    allDay: false,
    participantIds: [workspace.user.id],
    recurrence: "none",
  });
})();
