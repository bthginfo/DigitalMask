import { describe, expect, it } from "vitest";
import { validateRecord } from "../src/modules/records/schemas";
import { documentSections, lookTitle, pieceDuration } from "../src/shared/document-sections";
import { recordMatchesPeriod } from "../src/shared/period-filter";
import { selectExportRecords } from "../src/modules/exports/selection";
import type { DomainRecord, RecordKind } from "../src/shared/contracts";

const row = (kind: RecordKind, id: string, data: Record<string, unknown>): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "theatre",
  departmentId: "maske",
  createdBy: "person",
  createdAt: "2026-09-30T09:00:00Z",
  updatedAt: "2026-09-30T09:00:00Z",
  version: 1,
});
describe("document compatibility and historical period selection", () => {
  it("preserves each legacy note and template field when mapping repeated sections", () => {
    const sections = documentSections(
      {
        preparation: "Vorbereiten",
        materials: "Pinsel",
        steps: "Schminke",
        changeover: "Wechsel",
        templateFields: { Haare: "Flechten" },
      },
      "looks",
    );
    expect(sections[0].key).toBe("preparation");
    expect(sections.flatMap((section) => section.entries.map((entry) => entry.text))).toEqual([
      "Vorbereiten",
      "Pinsel",
      "Schminke",
      "Wechsel",
      "Haare\nFlechten",
    ]);
    expect(documentSections({ sections: [] }, "looks")).toEqual([]);
    expect(documentSections({ notes: "Hinweis" }, "handovers")[1].entries[0].text).toBe("Hinweis");
  });
  it("uses actor names and the general piece duration, preserving historical title fallbacks", () => {
    const actors = [row("actors", "actor", { name: "Neuer Name" })];
    expect(lookTitle({ title: "Alt", actorId: "actor", actorName: "Snapshot" }, actors)).toBe(
      "Neuer Name",
    );
    expect(lookTitle({ actorName: "Freier Name" })).toBe("Freier Name");
    expect(lookTitle({ title: "Historisch" })).toBe("Historisch");
    const productions = [row("productions", "play", { durationMinutes: 95 })];
    expect(pieceDuration({ productionId: "play" }, productions)).toBe(95);
    expect(pieceDuration({ productionId: "play", productionDurationMinutes: 0 }, productions)).toBe(
      0,
    );
    const cleared = validateRecord("looks", {
      productionId: "play",
      actorName: "Lea",
      productionDurationMinutes: null,
    });
    expect(cleared.productionDurationMinutes).toBeNull();
    expect(pieceDuration(cleared, productions)).toBe(95);
  });
  it("validates individual text entries and prevents duplicate category or field identifiers", () => {
    expect(
      validateRecord("looks", {
        actorName: "Lea",
        sections: [
          {
            key: "hair",
            entries: [
              { id: "one", text: "Flechten" },
              { id: "two", text: "Fixieren" },
            ],
          },
        ],
      }),
    ).toMatchObject({ actorName: "Lea", title: "" });
    for (const sections of [
      [
        { key: "hair", entries: [] },
        { key: "hair", entries: [] },
      ],
      [
        {
          key: "hair",
          entries: [
            { id: "one", text: "A" },
            { id: "one", text: "B" },
          ],
        },
      ],
    ])
      expect(() => validateRecord("looks", { actorName: "Lea", sections })).toThrow();
    expect(
      validateRecord("handovers", {
        title: "Dienst",
        sections: [{ key: "care", entries: [{ id: "one", text: "Beachten" }] }],
        checklist: [{ text: "Aufräumen" }],
      }),
    ).toMatchObject({ date: "", checklist: [{ text: "Aufräumen", done: false }] });
  });
  it("filters historical production documents by their production period without excluding general notes", () => {
    const productions = [row("productions", "old", { season: "2021/22", premiere: "2021-11-05" })];
    const old = row("looks", "doc", { productionId: "old" });
    const general = row("looks", "general", {});
    expect(recordMatchesPeriod(old, { year: 2021, season: "2021/22" }, productions)).toBe(true);
    expect(recordMatchesPeriod(old, { year: 2026 }, productions)).toBe(false);
    expect(recordMatchesPeriod(general, { season: "2021/22" }, productions)).toBe(true);
    expect(
      selectExportRecords({
        kind: "looks",
        records: [old, general],
        year: 2021,
        references: { productions },
      }).map((record) => record.id),
    ).toEqual(["doc"]);
  });
  it("exports the general document folder without production documents", () => {
    const general = row("looks", "general", { actorName: "Lea" });
    const production = row("looks", "production", { productionId: "old" });
    expect(
      selectExportRecords({ kind: "looks", records: [general, production], generalOnly: true }).map(
        (record) => record.id,
      ),
    ).toEqual(["general"]);
    expect(() =>
      selectExportRecords({
        kind: "looks",
        records: [general, production],
        generalOnly: true,
        productionId: "old",
      }),
    ).toThrow();
  });
  it("retains New Year allocations and future occurrences from recurring events", () => {
    const booking = row("attendance", "booking", {
      date: "2026-12-31",
      dayAllocations: [
        { date: "2026-12-31", seconds: 3600 },
        { date: "2027-01-01", seconds: 3600 },
      ],
    });
    expect(recordMatchesPeriod(booking, { year: 2027 })).toBe(true);
    const recurring = row("events", "series", {
      start: "2026-12-15T10:00:00Z",
      recurrence: "weekly",
      until: "2027-02-01",
    });
    expect(recordMatchesPeriod(recurring, { year: 2027 })).toBe(true);
    expect(recordMatchesPeriod(recurring, { year: 2028 })).toBe(false);
  });
});
