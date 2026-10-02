import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contactsValue, type DomainRecord, type RecordData } from "../../src/shared/contracts";
import { productionMakeupChoiceFixture } from "./production-makeup-choice-fixture";

// Every API is local to these fictional fixtures, including writes and failed writes.
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const workspace = productionMakeupChoiceFixture();
  const writes: { method: string; data: RecordData; version?: number }[] = [];
  let reads = 0;
  let conflict = false;
  let releaseWrite: (() => void) | undefined;
  let delayWrite = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/workspace") {
      reads++;
      return route.fulfill({ json: workspace });
    }
    if (pathname.startsWith("/api/records/productions")) {
      const body = request.postDataJSON() as { data: RecordData; version?: number };
      writes.push({ method: request.method(), ...body });
      if (delayWrite) await new Promise<void>((resolve) => (releaseWrite = resolve));
      const id = pathname.split("/")[4];
      const previous = workspace.records.productions.find((record) => record.id === id);
      if (conflict && previous) previous.version = (body.version || previous.version) + 1;
      if (conflict || (previous && body.version !== previous.version))
        return route.fulfill({
          status: 409,
          json: { error: "Die Produktion wurde zwischenzeitlich geändert." },
        });
      const record: DomainRecord = {
        ...workspace.records.productions[0],
        id: id || `created-${writes.length}`,
        version: (previous?.version || 0) + 1,
        data: { ...previous?.data, ...body.data },
      };
      record.data.memberIds = [
        ...new Set([
          ...((record.data.memberIds || []) as string[]),
          ...contactsValue(record.data.contacts)
            .map((contact) => contact.memberId)
            .filter(Boolean),
        ]),
      ];
      workspace.records.productions = [
        ...workspace.records.productions.filter((production) => production.id !== record.id),
        record,
      ];
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return {
    workspace,
    writes,
    reads: () => reads,
    setConflict: (next: boolean) => (conflict = next),
    delayNextWrite: () => (delayWrite = true),
    releaseWrite: () => {
      delayWrite = false;
      releaseWrite?.();
    },
  };
}

async function capture(page: Page, filename: string) {
  const directory = process.env.E2E_ARTIFACTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, filename), fullPage: true });
}

const productionUrl = "/?module=productions&productionId=bear&tab=team";
const choice = (page: Page, name: string) =>
  page.getByRole("region", { name: "Produktionsteam", exact: true }).getByRole("button", {
    name: `Maskenbetreuung für ${name}`,
    exact: true,
  });

test("active team members can assign several makeup leads, preserving roles and membership", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem("digitalmask-theme", "light"));
  const state = await mock(page);
  const originalContacts = structuredClone(state.workspace.records.productions[0].data.contacts);
  const originalMembers = structuredClone(state.workspace.records.productions[0].data.memberIds);
  await page.goto(productionUrl);
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Janine")).toHaveAttribute("aria-pressed", "false");
  for (const hidden of ["Ruth", "DM.admin", "Mara"])
    await expect(choice(page, hidden)).toHaveCount(0);
  await capture(page, "production-desktop-light.png");
  const initialReads = state.reads();
  state.delayNextWrite();
  await choice(page, "Janine").click();
  await expect(choice(page, "Janine")).toBeDisabled();
  await expect(choice(page, "Jules")).toBeDisabled();
  await expect(choice(page, "Janine")).toHaveAttribute("aria-pressed", "false");
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].version).toBe(1);
  state.releaseWrite();
  await expect(choice(page, "Janine")).toHaveAttribute("aria-pressed", "true");
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "true");
  expect(
    contactsValue(state.writes[0].data.contacts).filter((contact) => contact.memberId === "janine"),
  ).toHaveLength(1);
  expect(state.writes[0].data.contacts).toEqual(
    expect.arrayContaining(originalContacts as unknown[]),
  );
  await choice(page, "Jules").click();
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "false");
  expect(state.writes[1].version).toBe(2);
  expect(state.writes[1].data.memberIds).toEqual(originalMembers);
  expect(
    contactsValue(state.writes[1].data.contacts).some((contact) => contact.id === "lead"),
  ).toBe(false);
  expect(
    contactsValue(state.writes[1].data.contacts).some(
      (contact) => contact.id === "other-member-role",
    ),
  ).toBe(true);
  for (const id of ["direction", "free-lead", "historical-lead"]) {
    expect(
      contactsValue(state.writes[1].data.contacts).find((contact) => contact.id === id),
    ).toEqual(contactsValue(originalContacts).find((contact) => contact.id === id));
  }
  expect(state.reads()).toBe(initialReads + 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("new and editing forms keep quick choices local, including contact-only team membership", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("digitalmask-theme", "dark"));
  const state = await mock(page);
  // A historical form can derive team membership solely from its linked makeup contact.
  state.workspace.records.productions[0].data.memberIds = ["janine", "lena", "inactive", "admin"];
  state.workspace.records.productions[0].data.contacts = contactsValue(
    state.workspace.records.productions[0].data.contacts,
  ).filter((contact) => contact.id !== "other-member-role");
  await page.goto(productionUrl);
  await page.getByRole("button", { name: "Team & Kontakte bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Team & Kontakte · Der Bär", exact: true });
  const team = edit.getByRole("group", { name: "Produktionsteam", exact: true });
  await expect(
    team.getByRole("button", { name: "Maskenbetreuung für Jules", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const initialReads = state.reads();
  await team.getByRole("button", { name: "Maskenbetreuung für Jules", exact: true }).click();
  await expect(team.getByRole("checkbox", { name: "Jules", exact: true })).toBeChecked();
  await expect(team.getByRole("checkbox", { name: "Jules", exact: true })).toBeEnabled();
  await team.getByRole("button", { name: "Maskenbetreuung für Janine", exact: true }).click();
  for (const hidden of ["Ruth", "DM.admin", "Mara"])
    await expect(
      team.getByRole("button", { name: `Maskenbetreuung für ${hidden}`, exact: true }),
    ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  expect(state.reads()).toBe(initialReads);
  await team.scrollIntoViewIfNeeded();
  await capture(page, "production-form-mobile-dark.png");
  await edit.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].version).toBe(1);
  expect(state.writes[0].data.memberIds).toContain("jules");
  expect(
    contactsValue(state.writes[0].data.contacts).filter((contact) => contact.memberId === "janine"),
  ).toHaveLength(1);
  expect(
    contactsValue(state.writes[0].data.contacts).some((contact) => contact.id === "lead"),
  ).toBe(false);
  await capture(page, "production-mobile-dark.png");
  await page.goto("/?module=productions");
  await page.getByRole("button", { name: "Produktion anlegen", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Produktion anlegen", exact: true });
  await create.getByRole("textbox", { name: /^Titel/ }).fill("Probentag");
  const newTeam = create.getByRole("group", { name: "Produktionsteam", exact: true });
  await newTeam.getByRole("checkbox", { name: "Janine", exact: true }).check();
  await newTeam.getByRole("button", { name: "Maskenbetreuung für Janine", exact: true }).click();
  await newTeam.getByRole("checkbox", { name: "Mara", exact: true }).check();
  await newTeam.getByRole("button", { name: "Maskenbetreuung für Mara", exact: true }).click();
  await expect(create.getByRole("group", { name: "Kontakt 1", exact: true })).toHaveCount(1);
  await expect(create.getByRole("group", { name: "Kontakt 2", exact: true })).toHaveCount(1);
  expect(state.writes).toHaveLength(1);
  await create.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(create).not.toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].method).toBe("POST");
  expect(contactsValue(state.writes[1].data.contacts)).toMatchObject([
    { memberId: "janine", role: "Maskenbetreuung", type: "makeup" },
    { memberId: "mara", role: "Maskenbetreuung", type: "makeup" },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("a stale quick assignment leaves the saved lead intact and offers deliberate refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("digitalmask-theme", "dark"));
  const state = await mock(page);
  await page.goto(productionUrl);
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "true");
  const initialReads = state.reads();
  state.setConflict(true);
  await choice(page, "Jules").click();
  const team = page.getByRole("region", { name: "Produktionsteam", exact: true });
  await expect(team.getByRole("alert")).toHaveText(
    /Produktion wurde inzwischen geändert.*nicht gespeichert/,
  );
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "true");
  expect(state.writes[0].version).toBe(1);
  expect(state.reads()).toBe(initialReads);
  await capture(page, "production-conflict-mobile-dark.png");
  state.setConflict(false);
  await team.getByRole("button", { name: "Aktuellen Stand laden", exact: true }).click();
  await expect(team.getByRole("alert")).toHaveCount(0);
  expect(state.reads()).toBe(initialReads + 1);
  await choice(page, "Jules").click();
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "false");
  expect(state.writes[1].version).toBe(2);
});

test("a successful team form save clears obsolete quick-assignment feedback", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("digitalmask-theme", "dark"));
  const state = await mock(page);
  await page.goto(productionUrl);
  await expect(choice(page, "Jules")).toHaveAttribute("aria-pressed", "true");
  state.setConflict(true);
  await choice(page, "Jules").click();
  const team = page.getByRole("region", { name: "Produktionsteam", exact: true });
  await expect(team.getByRole("alert")).toHaveText(/Produktion wurde inzwischen geändert/);
  state.setConflict(false);
  // Load the new version through the workspace footer without clearing the module's error.
  const previousReads = state.reads();
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect.poll(() => state.reads()).toBe(previousReads + 1);
  await page.getByRole("button", { name: "Team & Kontakte bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Team & Kontakte · Der Bär", exact: true });
  await edit.getByRole("button", { name: "Maskenbetreuung für Janine", exact: true }).click();
  await edit.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(choice(page, "Janine")).toHaveAttribute("aria-pressed", "true");
  await expect(team.getByRole("alert")).toHaveCount(0);
  await expect(
    team.getByRole("button", { name: "Aktuellen Stand laden", exact: true }),
  ).toHaveCount(0);
  await expect(team.getByRole("status")).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].version).toBe(2);
  await capture(page, "production-form-recovery-mobile-dark.png");
});
