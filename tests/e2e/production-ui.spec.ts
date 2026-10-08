import { test, expect, type Page } from "@playwright/test";
import {
  recordKinds,
  type DomainRecord,
  type RecordData,
  type RecordKind,
  type Workspace,
} from "../../src/shared/contracts";

// These tests intercept every API call; installed service workers must not bypass those mocks.
test.use({ serviceWorkers: "block" });

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOUlEQVRIie2WsREAAAwBM7XaFsaVMTRf6HNH+FPcpY4DhAUhhOYNSxGJKg5jZOa4AIlAsgClnuTgASskpGrJN+kBAAAAAElFTkSuQmCC",
  "base64",
);
function fixture(): Workspace {
  const user = {
    id: "admin-ui",
    name: "QA Admin",
    username: "qa",
    role: "admin" as const,
    status: "active" as const,
  };
  const workspace: Workspace = {
    user,
    organization: { id: "qa", name: "Testtheater" },
    department: { id: "qa", name: "Maske" },
    members: [
      user,
      { ...user, id: "member-ui", name: "QA Maskenbetreuung", role: "user" },
      { ...user, id: "inactive-ui", name: "QA Inaktiv", status: "disabled" },
    ],
    records: Object.fromEntries(
      recordKinds.map((kind) => [kind, []]),
    ) as unknown as Workspace["records"],
    projectHours: {},
    timer: null,
  };
  const add = (kind: RecordKind, id: string, data: RecordData) =>
    workspace.records[kind].push({
      kind,
      id,
      data,
      organizationId: "qa",
      departmentId: "qa",
      createdBy: user.id,
      createdAt: "2026-09-30T08:00:00Z",
      updatedAt: "2026-09-30T08:00:00Z",
      version: 1,
    });
  add("productions", "production-a", {
    title: "QA Sommernacht",
    status: "active",
    contacts: [
      {
        id: "contact-a",
        role: "Perückenberatung",
        type: "external",
        name: "QA Extern",
        memberId: "",
      },
    ],
    memberIds: [user.id],
  });
  add("productions", "production-b", {
    title: "QA Zweites Stück",
    status: "active",
    memberIds: [],
  });
  add("tasks", "task-a", {
    title: "QA Produktionsaufgabe",
    productionId: "production-a",
    status: "todo",
    assigneeIds: [user.id],
  });
  add("tasks", "task-b", {
    title: "QA Fremde Produktion",
    productionId: "production-b",
    status: "todo",
  });
  add("tasks", "task-team", {
    title: "QA Teamaufgabe",
    productionId: "",
    status: "todo",
    assigneeIds: [user.id],
  });
  add("sprints", "sprint-a", {
    title: "QA Sprint Sommernacht",
    productionId: "production-a",
    start: "2026-09-30",
    end: "2026-10-08",
    status: "active",
  });
  add("sprints", "sprint-b", {
    title: "QA Fremder Sprint",
    productionId: "production-b",
    start: "2026-09-30",
    end: "2026-10-08",
    status: "active",
  });
  add("characters", "character-a", { name: "QA Puck", productionId: "production-a" });
  add("characters", "character-b", { name: "QA Andere Figur", productionId: "production-b" });
  add("actors", "actor-a", { name: "QA Schauspielperson" });
  add("casting", "casting-a", {
    productionId: "production-a",
    characterId: "character-a",
    actorId: "actor-a",
    alternate: true,
    imageIds: [],
  });
  return workspace;
}
async function mock(page: Page) {
  const workspace = fixture();
  const writes: { kind: RecordKind; data: RecordData }[] = [];
  const exports: URL[] = [];
  let reads = 0;
  await page.route("**/api/workspace", (route) => {
    reads++;
    return route.fulfill({ json: workspace });
  });
  await page.route("**/api/records/**", (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const kind = parts[3] as RecordKind;
    const id = parts[4] || `created-${writes.length}`;
    const data = route.request().postDataJSON().data as RecordData;
    writes.push({ kind, data });
    const previous = workspace.records[kind].find((row) => row.id === id);
    const record: DomainRecord = {
      id,
      kind,
      organizationId: "qa",
      departmentId: "qa",
      createdBy: workspace.user.id,
      createdAt: "2026-09-30T08:00:00Z",
      updatedAt: "2026-09-30T09:00:00Z",
      version: (previous?.version || 0) + 1,
      data: { ...previous?.data, ...data },
    };
    if (kind === "productions")
      record.data.memberIds = [
        ...new Set([
          ...((record.data.memberIds as string[]) || []),
          ...((record.data.contacts || []) as { memberId: string }[])
            .map((row) => row.memberId)
            .filter(Boolean),
        ]),
      ];
    workspace.records[kind] = [...workspace.records[kind].filter((row) => row.id !== id), record];
    return route.fulfill({ json: record });
  });
  await page.route("**/api/files", (route) => {
    const body = route.request().postData() || "";
    const recordId = body.match(/name="recordId"\r\n\r\n([^\r]+)/)?.[1] || "casting-a";
    const kind = (body.match(/name="recordKind"\r\n\r\n([^\r]+)/)?.[1] as RecordKind) || "casting";
    const id = `file-${workspace.records.files.length}`;
    const file: DomainRecord = {
      id,
      kind: "files",
      organizationId: "qa",
      departmentId: "qa",
      createdBy: workspace.user.id,
      createdAt: "2026-09-30T08:00:00Z",
      updatedAt: "2026-09-30T08:00:00Z",
      version: 1,
      data: { name: `${id}.webp`, mime: "image/webp", recordKind: kind, recordId },
    };
    workspace.records.files.push(file);
    const owner = workspace.records[kind].find((row) => row.id === recordId);
    if (owner) owner.data.imageIds = [...((owner.data.imageIds as string[]) || []), id];
    return route.fulfill({ json: file });
  });
  await page.route("**/api/files/*", (route) =>
    route.fulfill({ contentType: "image/png", body: image }),
  );
  await page.route("**/api/messages?**", (route) => route.fulfill({ json: { messages: [] } }));
  await page.route("**/api/export?**", (route) => {
    exports.push(new URL(route.request().url()));
    return route.fulfill({ contentType: "text/csv", body: "QA fixture" });
  });
  return { workspace, writes, exports, reads: () => reads };
}
async function exportNow(page: Page) {
  await page.getByRole("button", { name: "Exportieren", exact: true }).click();
  await page.getByRole("button", { name: "Herunterladen", exact: true }).click();
}

for (const device of [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`production workspace · ${device.name} · ${theme}`, () => {
      test.use({ viewport: device.viewport });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(
          (value) => localStorage.setItem("digitalmask-theme", value),
          theme,
        );
      });
      test("project board, edits, subtasks and export stay in their production", async ({
        page,
      }) => {
        const state = await mock(page);
        await page.goto("/?module=productions&productionId=production-a&tab=tasks");
        await expect(
          page.getByRole("heading", { name: "QA Sommernacht", exact: true }),
        ).toBeVisible();
        const tabsFit = await page
          .locator(".production-tabs button")
          .evaluateAll((buttons) =>
            buttons.every(
              (button) => button.getBoundingClientRect().width >= button.scrollWidth - 1,
            ),
          );
        expect(
          tabsFit,
          "Production tab labels retain their intrinsic width without overlapping",
        ).toBe(true);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await expect
          .poll(
            () =>
              page.locator(".production-tabs").evaluate((container) => {
                const button = container.querySelector("button[aria-current='page']");
                if (!button) return false;
                const outer = container.getBoundingClientRect(),
                  active = button.getBoundingClientRect();
                return active.left >= outer.left - 1 && active.right <= outer.right + 1;
              }),
            { message: "The active production area is fully visible on deep links" },
          )
          .toBe(true);
        await expect(
          page.getByRole("button", { name: "QA Produktionsaufgabe", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "QA Teamaufgabe", exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByLabel("Sprint", { exact: true })).toHaveText(
          /QA Sprint Sommernacht/,
        );
        await expect(page.getByLabel("Sprint", { exact: true })).not.toHaveText(/Fremder/);
        await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Produktion", exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole("combobox", { name: "Übergeordnete Aufgabe", exact: true }),
        ).not.toHaveText(/QA Teamaufgabe|Fremde/);
        await page.getByLabel("Titel", { exact: false }).fill("QA Neue Produktionsaufgabe");
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "QA Neue Produktionsaufgabe", exact: true }),
        ).toBeVisible();
        expect(state.writes[0].data.productionId).toBe("production-a");
        await page.getByRole("button", { name: "QA Produktionsaufgabe", exact: true }).click();
        await page.getByRole("button", { name: "Unteraufgabe anlegen", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Produktion", exact: true })).toHaveCount(
          0,
        );
        await page.getByLabel("Titel", { exact: false }).fill("QA Unteraufgabe");
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        expect(state.writes[1].data.productionId).toBe("production-a");
        expect(state.writes[1].data.parentId).toBe("task-a");
        await page.getByRole("button", { name: "Schließen", exact: true }).last().click();
        await exportNow(page);
        await expect.poll(() => state.exports.length).toBe(1);
        expect(state.exports[0].searchParams.get("productionId")).toBe("production-a");
        expect(state.reads()).toBe(3);
      });
      test("Teamboard excludes productions, production parents and sprints", async ({ page }) => {
        const state = await mock(page);
        await page.goto("/?module=tasks");
        await expect(
          page.getByRole("button", { name: "QA Teamaufgabe", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "QA Produktionsaufgabe", exact: true }),
        ).toHaveCount(0);
        await expect(page.getByLabel("Sprint", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Sprint planen" })).toHaveCount(0);
        await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
        await expect(
          page.getByRole("combobox", { name: "Übergeordnete Aufgabe", exact: true }),
        ).not.toHaveText(/Produktionsaufgabe|Fremde/);
        await page.getByLabel("Titel", { exact: false }).fill("QA Neue Teamaufgabe");
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "QA Neue Teamaufgabe", exact: true }),
        ).toBeVisible();
        expect(state.writes[0].data.productionId).toBe("");
        expect(state.writes[0].data.sprintId).toBe("");
        await exportNow(page);
        await expect.poll(() => state.exports.length).toBe(1);
        expect(state.exports[0].searchParams.get("teamOnly")).toBe("true");
        expect(state.exports[0].searchParams.has("productionId")).toBe(false);
      });
      test("arbitrary external roles, active makeup picker and free-name fallback", async ({
        page,
      }) => {
        const state = await mock(page);
        await page.goto("/?module=productions&productionId=production-a&tab=team");
        await page.getByRole("button", { name: "Team & Kontakte bearbeiten", exact: true }).click();
        await expect(page.locator("datalist option[value='Perückenberatung']")).toHaveCount(1);
        await page.getByRole("button", { name: "Kontakt hinzufügen", exact: true }).click();
        const contact = page.getByRole("group", { name: "Kontakt 2", exact: true });
        await contact.getByLabel("Rolle", { exact: true }).fill("QA Eigene Maskenrolle");
        await contact
          .getByRole("combobox", { name: "Zuordnung", exact: true })
          .selectOption("makeup");
        await contact.getByLabel("Person für Kontakt 2", { exact: true }).selectOption("member-ui");
        await expect(contact.getByLabel("Person für Kontakt 2", { exact: true })).not.toHaveText(
          /Inaktiv/,
        );
        await expect(page.getByRole("checkbox", { name: /QA Maskenbetreuung/ })).toBeChecked();
        await expect(page.getByRole("checkbox", { name: /QA Maskenbetreuung/ })).toBeDisabled();
        await page.getByRole("button", { name: "Kontakt hinzufügen", exact: true }).click();
        const free = page.getByRole("group", { name: "Kontakt 3", exact: true });
        await free.getByLabel("Rolle", { exact: true }).fill("QA Gästemaske");
        await free.getByRole("combobox", { name: "Zuordnung", exact: true }).selectOption("makeup");
        await free.getByLabel("Name", { exact: true }).fill("QA Freier Name");
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        await expect(
          page.getByText("QA Eigene Maskenrolle", { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText("QA Freier Name", { exact: true })).toBeVisible();
        const contacts = state.writes[0].data.contacts as { memberId: string; name: string }[];
        expect(contacts[1]).toMatchObject({ memberId: "member-ui", name: "" });
        expect(contacts[2]).toMatchObject({ memberId: "", name: "QA Freier Name" });
        expect(state.reads()).toBe(2);
      });
      test("casting galleries retain multiple images; calendar and time stay scoped", async ({
        page,
      }) => {
        const state = await mock(page);
        await page.goto("/?module=productions&productionId=production-a&tab=casting");
        await page.getByRole("button", { name: "Besetzung anlegen", exact: true }).first().click();
        await expect(page.getByRole("combobox", { name: "Produktion", exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByRole("combobox", { name: /^Figur/ })).not.toHaveText(/Andere Figur/);
        await page.getByRole("combobox", { name: /^Figur/ }).selectOption("character-a");
        await page.getByRole("combobox", { name: /^Schauspieler/ }).selectOption("actor-a");
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        const gallery = page.getByRole("dialog", {
          name: "QA Puck · QA Schauspielperson",
          exact: true,
        });
        await expect(gallery).toBeVisible();
        await gallery.locator("input[type=file]").setInputFiles([
          { name: "qa-1.png", mimeType: "image/png", buffer: image },
          { name: "qa-2.png", mimeType: "image/png", buffer: image },
        ]);
        await expect(gallery.locator(".gallery-item")).toHaveCount(2);
        await gallery.getByRole("button", { name: "Bearbeiten", exact: true }).click();
        await page.getByRole("button", { name: "Speichern", exact: true }).click();
        expect(state.writes[1].data.imageIds).toHaveLength(2);
        await page.getByRole("button", { name: "Schließen", exact: true }).last().click();
        await page
          .locator(".production-tabs")
          .getByRole("button", { name: "Kalender", exact: true })
          .click();
        await expect(
          page.getByRole("combobox", { name: "Produktion", exact: true }),
        ).toBeDisabled();
        await expect(page.getByRole("combobox", { name: "Produktion", exact: true })).toHaveValue(
          "production-a",
        );
        await page
          .locator(".production-tabs")
          .getByRole("button", { name: "Produktionsstunden", exact: true })
          .click();
        await expect(
          page.getByRole("combobox", { name: "Produktion", exact: true }),
        ).toBeDisabled();
        await expect(page.getByLabel("Produktion für Timer", { exact: true })).toHaveValue(
          "production-a",
        );
        await expect(page.getByLabel("Produktion für Timer", { exact: true })).toBeDisabled();
        expect(state.reads()).toBe(4);
      });
    });
  }
}

test("read-only team permissions and cached production search navigation", async ({ page }) => {
  const state = await mock(page);
  state.workspace.user = {
    ...state.workspace.user,
    id: "viewer-ui",
    role: "user",
    name: "QA Lesendes Mitglied",
  };
  state.workspace.members.push(state.workspace.user);
  await page.goto("/?module=tasks");
  await expect(page.getByRole("combobox", { name: "Status von QA Teamaufgabe" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Aufgabe verschieben", exact: true }),
  ).toBeDisabled();
  await page.goto("/?module=productions");
  await expect(page.getByRole("button", { name: "Produktion anlegen", exact: true })).toHaveCount(
    0,
  );
  await page.locator(".global-search-button:visible, .search-mobile:visible").first().click();
  await page
    .getByRole("textbox", { name: "Suchbegriff", exact: true })
    .fill("QA Produktionsaufgabe");
  await page
    .locator(".search-results")
    .getByRole("button", { name: /QA Produktionsaufgabe/ })
    .click();
  await expect(page).toHaveURL(
    /module=productions&productionId=production-a&tab=tasks&record=task-a/,
  );
  await expect(
    page.getByRole("dialog", { name: "QA Produktionsaufgabe", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bearbeiten", exact: true })).toHaveCount(0);
  expect(state.reads()).toBe(2);
});
