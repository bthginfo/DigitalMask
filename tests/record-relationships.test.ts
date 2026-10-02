import { describe, expect, it } from "vitest";
import {
  actorLooks,
  actorProductions,
  characterCastings,
  personProductions,
} from "../src/shared/record-relationships";
import {
  actorPortrait,
  portraitFocus,
  portraitLayout,
} from "../src/modules/ensemble/portrait-layout";
import {
  recordKinds,
  type DomainRecord,
  type RecordData,
  type RecordKind,
  type Workspace,
} from "../src/shared/contracts";

const row = (kind: RecordKind, id: string, data: RecordData): DomainRecord => ({
  kind,
  id,
  data,
  organizationId: "team",
  departmentId: "mask",
  createdBy: "staff",
  createdAt: "2026-10-02T08:00:00Z",
  updatedAt: "2026-10-02T08:00:00Z",
  version: 1,
});
function fixture() {
  const workspace = {
    records: Object.fromEntries(recordKinds.map((kind) => [kind, []])),
  } as unknown as Workspace;
  workspace.records.productions = [
    row("productions", "current", { title: "Dinner", season: "2026/27" }),
    row("productions", "old", {
      title: "Vergangene Produktion",
      season: "2024/2025",
      status: "archived",
    }),
  ];
  workspace.records.characters = [
    row("characters", "figure", { name: "Pierre", productionId: "current" }),
  ];
  workspace.records.casting = [
    row("casting", "a", { actorId: "actor", characterId: "figure", productionId: "current" }),
    row("casting", "b", {
      actorId: "actor",
      characterName: "Zweite Rolle",
      productionId: "current",
      alternate: true,
    }),
    row("casting", "c", { actorId: "actor", characterName: "Frühere Rolle", productionId: "old" }),
    row("casting", "free", {
      actorName: "Gleicher Name",
      characterId: "figure",
      productionId: "current",
    }),
    row("casting", "unavailable", { actorId: "actor", productionId: "not-authorised" }),
  ];
  return workspace;
}

describe("relationships use explicit authorised IDs", () => {
  it("groups multiple and alternate roles, honours season spelling, excludes free-text and inaccessible productions", () => {
    const workspace = fixture();
    const current = actorProductions("actor", workspace, { season: "2026/2027" });
    expect(current.map((item) => item.production.id)).toEqual(["current"]);
    expect(current[0].castings.map((casting) => casting.id)).toEqual(["a", "b"]);
    expect(
      actorProductions("actor", workspace, {})
        .map((item) => item.production.id)
        .sort(),
    ).toEqual(["current", "old"]);
  });
  it("retains a free-text casting as such instead of inventing an actor link", () => {
    const castings = characterCastings("figure", fixture());
    expect(castings.map((casting) => casting.id)).toEqual(["a", "free"]);
    expect(castings[1].data.actorId).toBeUndefined();
  });
  it("keeps general actor notes visible alongside the selected production season", () => {
    const workspace = fixture();
    workspace.records.looks = [
      row("looks", "general", { actorId: "actor" }),
      row("looks", "old-look", { actorId: "actor", productionId: "old" }),
      row("looks", "name-only", { actorName: "Gleicher Name" }),
    ];
    expect(actorLooks("actor", workspace, { season: "2026/27" }).map((look) => look.id)).toEqual([
      "general",
    ]);
  });
  it("aggregates the contact's roles per production without matching text names", () => {
    const workspace = fixture();
    const contact = {
      id: "contact-a",
      role: "Regie",
      type: "external",
      name: "Name",
      memberId: "",
      personId: "person",
    };
    workspace.records.productions[0].data.contacts = [
      contact,
      { ...contact, id: "contact-b", role: "Assistenz" },
      { ...contact, id: "free", personId: "", role: "Kostüm" },
    ];
    expect(personProductions("person", workspace, { season: "2026/27" })[0].roles).toEqual([
      "Regie",
      "Assistenz",
    ]);
  });
});

describe("actor portrait framing", () => {
  it("prefers the chosen attached actor portrait and otherwise keeps a manual photo", () => {
    const actor = row("actors", "actor", { portraitFileId: "wrong-parent" });
    const files = [
      row("files", "wrong-parent", {
        recordKind: "casting",
        recordId: "actor",
        mime: "image/jpeg",
      }),
      row("files", "theatre", {
        recordKind: "actors",
        recordId: "actor",
        mime: "image/jpeg",
        sourceUrl: "https://theater.ingolstadt.de/photo",
      }),
      row("files", "manual", { recordKind: "actors", recordId: "actor", mime: "image/jpeg" }),
    ];
    expect(actorPortrait(actor, files)?.id).toBe("manual");
    actor.data.portraitFileId = "theatre";
    expect(actorPortrait(actor, files)?.id).toBe("theatre");
  });
  it("keeps the whole detected face in a wide, shallow frame instead of cutting it off", () => {
    const focus = portraitFocus({
      x: 0.4,
      y: 0.2,
      faceWidth: 0.3,
      faceHeight: 0.24,
      detected: true,
    });
    const layout = portraitLayout(
      { width: 1200, height: 1800 },
      { width: 480, height: 180 },
      focus,
    )!;
    expect(layout.left + (focus.x - focus.faceWidth / 2) * layout.width).toBeGreaterThanOrEqual(0);
    expect(layout.left + (focus.x + focus.faceWidth / 2) * layout.width).toBeLessThanOrEqual(480);
    expect(layout.top + (focus.y - focus.faceHeight / 2) * layout.height).toBeGreaterThanOrEqual(0);
    expect(layout.top + (focus.y + focus.faceHeight / 2) * layout.height).toBeLessThanOrEqual(180);
  });
  it("focuses high in older photos, handles landscape frames, and rejects invalid image sizes", () => {
    const focus = portraitFocus(undefined);
    const portrait = portraitLayout(
      { width: 800, height: 1200 },
      { width: 400, height: 180 },
      focus,
    )!;
    expect(portrait.top).toBe(-54);
    const landscape = portraitLayout(
      { width: 1200, height: 800 },
      { width: 200, height: 300 },
      portraitFocus({ x: 0.9, y: 0.5 }),
    )!;
    expect(landscape.left).toBe(200 - landscape.width);
    expect(
      portraitLayout({ width: 0, height: 0 }, { width: 400, height: 180 }, focus),
    ).toBeUndefined();
  });
});
