import { describe, expect, it } from "vitest";
import { recordKinds, type DomainRecord, type Workspace } from "../src/shared/contracts";
import { matchesSearch, searchIndex, searchTerms, searchText } from "../src/shared/search-text";

const row = (kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]): DomainRecord => ({
  id,
  kind,
  data,
  version: 1,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  createdBy: "u-anna",
  organizationId: "org",
  departmentId: "mask",
});

const productionId = "7d5c1f9e-3a8b-4c2d-9e1f-0a1b2c3d4e5f";
const actorId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const characterId = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";

function workspace(records: Partial<Workspace["records"]>): Workspace {
  return {
    live: null,
    user: { id: "u-anna", name: "Anna Krämer", username: "anna", role: "admin", status: "active" },
    organization: { id: "org", name: "Theater" },
    department: { id: "mask", name: "Maske" },
    members: [
      { id: "u-anna", name: "Anna Krämer", username: "anna", role: "admin", status: "active" },
      { id: "u-ben", name: "Ben Schuster", username: "ben", role: "user", status: "active" },
    ],
    records: {
      ...(Object.fromEntries(
        recordKinds.map((kind) => [kind, []]),
      ) as unknown as Workspace["records"]),
      ...records,
    },
    timer: null,
    projectHours: {},
  };
}

describe("shared record search text", () => {
  const production = row("productions", productionId, {
    title: "Kabale und Liebe",
    season: "2026/2027",
    status: "active",
  });
  const actor = row("actors", actorId, { name: "Lena Berg", hair: "Lang, dunkel" });
  const figure = row("characters", characterId, { name: "Luise", productionId });
  const casting = row("casting", "c-1", { productionId, actorId, characterId });
  const look = row("looks", "l-1", {
    productionId,
    actorId,
    characterId,
    status: "published",
    sections: [{ key: "hair", entries: [{ id: "e-1", text: "Zopf flechten" }] }],
  });
  const task = row("tasks", "t-1", {
    title: "Perücke frisieren",
    productionId,
    assigneeIds: ["u-ben"],
    checklist: [{ text: "Netz besorgen", done: false }],
  });
  const ws = workspace({
    productions: [production],
    actors: [actor],
    characters: [figure],
    casting: [casting],
    looks: [look],
    tasks: [task],
  });

  it("resolves names behind references that castings and notes only store as IDs", () => {
    const text = searchText("casting", casting, ws);
    expect(matchesSearch(text, searchTerms("Lena"))).toBe(true);
    expect(matchesSearch(text, searchTerms("luise berg"))).toBe(true);
    expect(matchesSearch(text, searchTerms("Kabale"))).toBe(true);
    const lookText = searchText("looks", look, ws);
    expect(matchesSearch(lookText, searchTerms("lena"))).toBe(true);
    expect(matchesSearch(lookText, searchTerms("Haare zopf"))).toBe(true);
  });

  it("ignores IDs, JSON keys and internal codes", () => {
    const text = searchText("casting", casting, ws);
    expect(matchesSearch(text, searchTerms("7d5c1f9e"))).toBe(false);
    expect(matchesSearch(text, searchTerms("actorId"))).toBe(false);
    expect(matchesSearch(text, searchTerms("{"))).toBe(false);
    const lookText = searchText("looks", look, ws);
    expect(matchesSearch(lookText, searchTerms("published"))).toBe(false);
    expect(matchesSearch(lookText, searchTerms("sections"))).toBe(false);
  });

  it("finds assigned people, checklist entries and nested text", () => {
    const text = searchText("tasks", task, ws);
    expect(matchesSearch(text, searchTerms("Ben"))).toBe(true);
    expect(matchesSearch(text, searchTerms("netz"))).toBe(true);
    expect(matchesSearch(text, searchTerms("perücke kabale"))).toBe(true);
    expect(matchesSearch(text, searchTerms("perücke woyzeck"))).toBe(false);
  });

  it("indexes a record list once and treats an empty query as a match", () => {
    const index = searchIndex("casting", [casting], ws);
    expect(index.get("c-1")).toContain("lena berg");
    expect(matchesSearch(index.get("c-1")!, searchTerms("   "))).toBe(true);
  });
});
