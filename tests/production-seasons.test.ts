import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialPeriod,
  normalizeSeasonList,
  periodOptions,
  productionPlaysIn,
  productionSeasons,
  recordMatchesPeriod,
  seasonForDate,
  seasonListLabel,
  shiftSeason,
  shortSeasonLabel,
  withProductionSeason,
} from "../src/shared/period-filter";
import { validateRecord } from "../src/modules/records/schemas";
import { selectExportRecords } from "../src/modules/exports/selection";
import { buildExport } from "../src/modules/exports";
import { calendarProductionReference } from "../src/shared/calendar-access";
import type { DomainRecord } from "../src/shared/contracts";

const row = (
  id: string,
  kind: DomainRecord["kind"],
  data: DomainRecord["data"],
  createdAt = "2026-10-01T08:00:00Z",
): DomainRecord => ({
  id,
  kind,
  data,
  createdAt,
  updatedAt: createdAt,
  version: 1,
  departmentId: "maske",
  organizationId: "theatre",
  createdBy: "team",
});

const repertoire = row("repertoire", "productions", {
  title: "Fiktives Repertoirestück",
  season: "2025/2026",
  seasons: ["2025/2026", "2026/2027"],
});
const legacy = row("legacy", "productions", { title: "Altes Stück", season: "2025 / 26" });
const productions = [repertoire, legacy];

describe("repertoire productions across seasons", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("derives effective seasons from the list and falls back to the legacy season", () => {
    expect(productionSeasons(repertoire.data)).toEqual(["2025/2026", "2026/2027"]);
    expect(productionSeasons(legacy.data)).toEqual(["2025 / 26"]);
    expect(productionSeasons({ season: "2024/25", seasons: [] })).toEqual(["2024/25"]);
    expect(productionSeasons({ seasons: ["2026/27", "2026 / 2027", "2024/2025"] })).toEqual([
      "2024/2025",
      "2026/27",
    ]);
    expect(productionSeasons({ title: "Ohne Spielzeit" })).toEqual([]);
    expect(productionSeasons({ season: "Sommerfestival" })).toEqual(["Sommerfestival"]);
    expect(productionPlaysIn(repertoire.data, "2026 / 27")).toBe(true);
    expect(productionPlaysIn(repertoire.data, "2024/2025")).toBe(false);
    expect(productionPlaysIn({ season: "Sommerfestival" }, "Sommerfestival")).toBe(true);
    expect(productionPlaysIn(repertoire.data, undefined)).toBe(false);
  });

  it("shows a production and everything linked to it in each of its seasons", () => {
    for (const season of ["2025/26", "2026/2027"]) {
      const period = { season };
      expect(recordMatchesPeriod(repertoire, period, productions)).toBe(true);
      for (const kind of ["looks", "tasks", "maskPlans", "casting", "characters"] as const)
        expect(
          recordMatchesPeriod(row(kind, kind, { productionId: "repertoire" }), period, productions),
        ).toBe(true);
    }
    expect(recordMatchesPeriod(repertoire, { season: "2024/2025" }, productions)).toBe(false);
    expect(recordMatchesPeriod(legacy, { season: "2026/2027" }, productions)).toBe(false);
    expect(
      recordMatchesPeriod(
        row("old-look", "looks", { productionId: "legacy" }),
        { season: "2025/2026" },
        productions,
      ),
    ).toBe(true);
    expect(recordMatchesPeriod(repertoire, {}, productions)).toBe(true);
  });

  it("keeps general tasks and dated entries on their own season", () => {
    const general = row("general", "tasks", { title: "Teamaufgabe", season: "2025/2026" });
    expect(recordMatchesPeriod(general, { season: "2025/2026" }, productions)).toBe(true);
    expect(recordMatchesPeriod(general, { season: "2026/2027" }, productions)).toBe(false);
    const event = row("event", "events", {
      productionId: "repertoire",
      start: "2025-12-01T18:00:00Z",
      end: "2025-12-01T21:00:00Z",
    });
    expect(recordMatchesPeriod(event, { season: "2025/2026" }, productions)).toBe(true);
    expect(recordMatchesPeriod(event, { season: "2026/2027" }, productions)).toBe(false);
  });

  it("opens a running production in the current season and an older one in its latest season", () => {
    expect(seasonForDate(productions)).toBe("2026/2027");
    expect(initialPeriod(productions, "repertoire")).toEqual({ season: "2026/2027" });
    const older = row("older", "productions", { seasons: ["2022/2023", "2023/2024"] });
    expect(initialPeriod([...productions, older], "older")).toEqual({ season: "2023/2024" });
    expect(initialPeriod(productions, "legacy")).toEqual({ season: "2025 / 26" });
    expect(initialPeriod(productions)).toEqual({ season: "2026/2027" });
  });

  it("offers every listed season in the period choices", () => {
    const options = periodOptions(productions, [
      row("p", "productions", { seasons: ["2023/2024", "2024/2025"] }),
      repertoire,
    ]);
    expect(options.seasons).toEqual(["2026/2027", "2025/2026", "2024/2025", "2023/2024"]);
  });

  it("stores a validated, sorted list and keeps the premiere season in season", () => {
    const data = validateRecord("productions", {
      title: "Stück",
      season: "2026/2027",
      seasons: ["2026/27", "2025 / 2026", "2026/2027"],
    });
    expect(data.seasons).toEqual(["2025/2026", "2026/2027"]);
    expect(data.season).toBe("2025/2026");
    expect(() =>
      validateRecord("productions", { title: "Stück", seasons: ["nächste Spielzeit"] }),
    ).toThrow();
    const old = validateRecord("productions", { title: "Altes Stück", season: "2025 / 26" });
    expect(old.season).toBe("2025 / 26");
    expect(old).not.toHaveProperty("seasons");
    expect(validateRecord("productions", { title: "Leer", seasons: [], season: "" })).toMatchObject(
      { seasons: [], season: "" },
    );
  });

  it("adds a season without duplicates and labels lists compactly", () => {
    expect(withProductionSeason(legacy.data, "2026/27")).toEqual(["2025/2026", "2026/2027"]);
    expect(withProductionSeason(repertoire.data, "2026 / 2027")).toEqual([
      "2025/2026",
      "2026/2027",
    ]);
    expect(() => withProductionSeason(legacy.data, "später")).toThrow();
    expect(normalizeSeasonList(["2027/28", undefined, "2025/26", "2027/2028", "x"])).toEqual([
      "2025/2026",
      "2027/2028",
    ]);
    expect(shiftSeason("2026/27", 1)).toBe("2027/2028");
    expect(shiftSeason("2026/2027", -1)).toBe("2025/2026");
    expect(shortSeasonLabel("2025/2026")).toBe("2025/26");
    expect(shortSeasonLabel("Sommerfestival")).toBe("Sommerfestival");
    expect(seasonListLabel(productionSeasons(repertoire.data))).toBe("2025/26 · 2026/27");
    expect(seasonListLabel(["2022/2023", "2023/2024", "2024/2025", "2025/2026", "2026/2027"])).toBe(
      "2022/23 · … · 2026/27",
    );
  });

  it("exports repertoire documents for each season and lists all seasons of a production", async () => {
    const look = row("look", "looks", { productionId: "repertoire", actorName: "Lea" });
    for (const season of ["2025/2026", "2026/27"])
      expect(
        selectExportRecords({
          kind: "looks",
          records: [look],
          season,
          references: { productions },
        }).map((record) => record.id),
      ).toEqual(["look"]);
    const csv = new TextDecoder().decode(
      (
        await buildExport({
          kind: "productions",
          format: "csv",
          season: "2026/2027",
          records: productions,
          members: [],
          organization: "Theater",
          department: "Maske",
        })
      ).bytes,
    );
    expect(csv).toContain("Fiktives Repertoirestück");
    expect(csv).toContain("2025/2026, 2026/2027");
    expect(csv).not.toContain("Altes Stück");
  });

  it("shares the season list with calendar and overview references", () => {
    expect(calendarProductionReference(repertoire).data.seasons).toEqual([
      "2025/2026",
      "2026/2027",
    ]);
    expect(calendarProductionReference(legacy).data).not.toHaveProperty("seasons");
  });
});
