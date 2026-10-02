import { describe, expect, it } from "vitest";
import {
  parseEnsemble,
  parseProfile,
  sourceAssetUrl,
  type EnsemblePerson,
} from "../src/modules/ensemble/source";
import { importedActorData, matchActor } from "../src/modules/ensemble/matching";
import { productionCastingCounts } from "../src/modules/productions/counts";
import { validateRecord } from "../src/modules/records/schemas";
import type { DomainRecord } from "../src/shared/contracts";
const person: EnsemblePerson = {
  sourceId: "2331",
  name: "Michael Amelung",
  sourceUrl:
    "https://theater.ingolstadt.de/ensemble/schauspielerinnen/schauspielerinnen-detailseite/2331.html",
  biography: "Öffentliche Biografie",
  ensembleStatus: "",
  imageUrl: "",
  imageCredit: "",
  productions: ["Ein Stück (Rolle)"],
};
describe("Ensemble source and safe catalog matching", () => {
  it("reads only house cards, decodes names and all-day parenthetic status, ignores guest navigation", () => {
    const rows = parseEnsemble(
      `<nav><a href="/ensemble/schauspielerinnen.html?guest=1">Gäste</a></nav><ul class="tt_address_list gallery"><li class="vcard"><img src="/fileadmin/portrait.jpg"><figcaption><a href="/ensemble/schauspielerinnen/schauspielerinnen-detailseite/2331.html">Michael Amelung</a></figcaption></li><li class="vcard"><figcaption><a href="/ensemble/schauspielerinnen/schauspielerinnen-detailseite/3052.html">Paula Gendrisch (in Elternzeit)</a></figcaption></li></ul>`,
    );
    expect(rows.map((x) => [x.name, x.ensembleStatus])).toEqual([
      ["Michael Amelung", ""],
      ["Paula Gendrisch", "in Elternzeit"],
    ]);
    expect(rows[0].imageUrl).toBe("https://theater.ingolstadt.de/fileadmin/portrait.jpg");
  });
  it("scopes biography/current roles and excludes navigation and historic roles", () => {
    const profile = parseProfile(
      `<nav><p>Ignore</p></nav><div class="tt_address_detail"><h1 itemprop="name">Michael Amelung</h1><img src="/fileadmin/photo.jpg"></div><div class="fetchurl"><h1>Michael Amelung</h1><p>Ausbildung &amp; Ensemble</p><p>Zweite Angabe</p></div><div class="fetchurl"><h2>Aktuelle Produktionen:</h2><ul><li><a>Neues Stück</a> (Rolle)</li></ul></div><div class="fetchurl"><h2>Bekannt aus:</h2><ul><li>Historisch</li></ul></div>`,
      person,
    );
    expect(profile.biography).toBe("Ausbildung & Ensemble\n\nZweite Angabe");
    expect(profile.productions).toEqual(["Neues Stück (Rolle)"]);
  });
  it("rejects broken source markup and unsafe image hosts/protocols/credentials", () => {
    expect(() => parseEnsemble("<p>Unavailable</p>")).toThrow();
    expect(() => parseProfile("<html>Unavailable</html>", person)).toThrow();
    for (const url of [
      "http://theater.ingolstadt.de/fileadmin/photo.jpg",
      "https://example.com/photo.jpg",
      "https://user@theater.ingolstadt.de/fileadmin/photo.jpg",
      "/api/private",
      "//127.0.0.1/fileadmin/a.jpg",
    ])
      expect(() => sourceAssetUrl(url)).toThrow();
  });
  it("keeps an existing actor ID, normalizes accents and detects ambiguous duplicates", () => {
    const actor = { id: "lena-actor", data: { name: "  MICHAEL   AMELUNG " } };
    expect(matchActor(person, [actor])).toMatchObject({
      action: "update",
      actor: { id: "lena-actor" },
    });
    expect(
      matchActor({ ...person, name: "Péter Polgár" }, [
        { id: "p", data: { name: "Peter Polgar" } },
      ]),
    ).toMatchObject({ action: "update" });
    expect(
      matchActor(person, [actor, { id: "other", data: { sourceId: "2331", name: "Old name" } }]),
    ).toEqual({ action: "conflict" });
    expect(matchActor(person, [{ id: "abbreviated", data: { name: "Michael A." } }])).toEqual({
      action: "create",
    });
  });
  it("updates source data without replacing manual notes, measures, photos or extra actors", () => {
    const data = validateRecord(
      "actors",
      importedActorData(person, {
        name: "Old name",
        hair: "braun",
        notes: "Interner Hinweis",
        wigSize: "57",
        imageIds: ["own-photo"],
        contact: "Agentur",
      }),
    );
    expect(data).toMatchObject({
      name: person.name,
      hair: "braun",
      notes: "Interner Hinweis",
      wigSize: "57",
      imageIds: ["own-photo"],
      contact: "Agentur",
      sourceId: "2331",
      ensembleProductions: person.productions,
    });
    const actors = [{ id: "extra", data: { name: "Gast Schauspieler" } }];
    expect(matchActor(person, actors)).toEqual({ action: "create" });
    expect(actors[0].id).toBe("extra");
  });
});
const row = (id: string, data: DomainRecord["data"]) => ({ id, data }) as DomainRecord;
describe("production figures and casting counts", () => {
  it("counts Abschiedsdinner text figures and assignments without any standalone figures", () => {
    const casting = ["Pierre Lecoeur", "Clotilde Lecoeur", "Antoine Royer"].map((name, i) =>
      row(String(i), { productionId: "dinner", characterName: name }),
    );
    expect(productionCastingCounts("dinner", [], casting)).toEqual({ characters: 3, casting: 3 });
  });
  it("deduplicates text roles against linked figures and alternate casts, excludes other productions", () => {
    const figures = [
      row("fig", { productionId: "dinner", name: "Pierre Lecoeur" }),
      row("other", { productionId: "elsewhere", name: "Other" }),
    ];
    const casting = [
      row("1", { productionId: "dinner", characterId: "fig" }),
      row("2", { productionId: "dinner", characterName: " pierre   LECOEUR ", alternate: true }),
      row("3", { productionId: "elsewhere", characterName: "Unrelated" }),
    ];
    expect(productionCastingCounts("dinner", figures, casting)).toEqual({
      characters: 1,
      casting: 2,
    });
  });
});
