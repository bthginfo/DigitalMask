import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actorSeasons,
  initialPeriod,
  periodOptions,
  recordMatchesPeriod,
  seasonKey,
  teamTaskSeason,
} from "../src/shared/period-filter";
import { applySeasonDefaults } from "../src/modules/records/season-defaults";
import { validateRecord } from "../src/modules/records/schemas";
import { buildExport } from "../src/modules/exports";
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

describe("stable season membership and period selection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("starts global views current but retains a historical production's own season", () => {
    const productions = [row("historical", "productions", { season: "2022 / 23" })];
    expect(initialPeriod(productions)).toEqual({ season: "2026/2027" });
    expect(initialPeriod(productions, "historical")).toEqual({ season: "2022 / 23" });
    expect(
      recordMatchesPeriod(
        row("task", "tasks", { productionId: "historical" }),
        initialPeriod(productions, "historical"),
        productions,
      ),
    ).toBe(true);
  });

  it("filters the general Teamboard by persisted assignment and dates only for legacy tasks", () => {
    const current = { season: "2026/27" };
    const old = row("old", "tasks", {
      title: "Alte Aufgabe",
      season: "2025/2026",
      due: "2026-10-12",
    });
    expect(recordMatchesPeriod(old, current)).toBe(false);
    expect(recordMatchesPeriod(old, {})).toBe(true);
    expect(recordMatchesPeriod(row("legacy", "tasks", { due: "2026-07-15" }), current)).toBe(false);
    expect(recordMatchesPeriod(row("new", "tasks", { season: "2026 / 27" }), current)).toBe(true);
    expect(teamTaskSeason({ title: "Alte Aufgabe" }, "2025-11-04T09:00:00Z")).toBe("2025/2026");
    expect(teamTaskSeason({ due: "später" }, "2025-11-04T09:00:00Z")).toBe("2025/2026");
  });

  it("persists current defaults while preserving archived tasks and explicit empty rosters", () => {
    expect(applySeasonDefaults("actors", { name: "Neue Person" })).toMatchObject({
      ensembleSeasons: ["2026/2027"],
    });
    expect(applySeasonDefaults("actors", { name: "Archiv", ensembleSeasons: [] })).toMatchObject({
      ensembleSeasons: [],
    });
    expect(
      applySeasonDefaults("tasks", { title: "Später fällig", due: "2028-10-01" }),
    ).toMatchObject({ season: "2026/2027" });
    expect(applySeasonDefaults("tasks", { title: "Archiv" }, "2023-01-03T08:00:00Z")).toMatchObject(
      { season: "2022/2023" },
    );
    expect(applySeasonDefaults("tasks", { title: "Archiv", season: "2022/23" })).toMatchObject({
      season: "2022/23",
    });
    expect(
      applySeasonDefaults("tasks", { title: "Stück", productionId: "historical" }),
    ).not.toHaveProperty("season");
  });

  it("keeps one actor in several rosters, all-mode reference access and consistent year filters", () => {
    const actor = row("actor", "actors", {
      name: "Person",
      ensembleSeasons: ["2022/23", "2026 / 27"],
    });
    expect(recordMatchesPeriod(actor, { season: "2022/2023" })).toBe(true);
    expect(recordMatchesPeriod(actor, { season: "2026/2027", year: 2027 })).toBe(true);
    expect(recordMatchesPeriod(actor, { season: "2026/2027", year: 2023 })).toBe(false);
    expect(recordMatchesPeriod(actor, { season: "2025/2026" })).toBe(false);
    const unassigned = row("unassigned", "actors", { name: "Ohne Spielzeit", ensembleSeasons: [] });
    expect(recordMatchesPeriod(unassigned, {})).toBe(true);
    expect(recordMatchesPeriod(unassigned, { season: "2026/2027" })).toBe(false);
    expect(actorSeasons({ name: "Legacy" })).toEqual(["2026/2027"]);
  });

  it("validates and normalizes editable memberships and includes actor-only archives in choices", () => {
    const data = validateRecord("actors", {
      name: "Person",
      ensembleSeasons: ["2026/27", "2026 / 2027", "2022–2023"],
    });
    expect(data.ensembleSeasons).toEqual(["2026/2027", "2022/2023"]);
    expect(() =>
      validateRecord("actors", { name: "Person", ensembleSeasons: ["2026/2028"] }),
    ).toThrow();
    expect(() => validateRecord("tasks", { title: "Aufgabe", season: "nächstes Jahr" })).toThrow();
    expect(seasonKey(" 2026 / 27 ")).toBe("2026/2027");
    const options = periodOptions(
      [row("a", "actors", data), row("t", "tasks", { season: "2024/25" })],
      [row("p", "productions", { season: "2026 / 27" })],
    );
    expect(options.seasons).toEqual(["2026 / 27", "2024/2025", "2022/2023"]);
    expect(options.years).toEqual(expect.arrayContaining([2027, 2026, 2023, 2022]));
  });

  it("exports only the selected roster without changing identity or production references", async () => {
    const actors = [
      row("shared", "actors", {
        name: "Beide Spielzeiten",
        ensembleSeasons: ["2025/2026", "2026/2027"],
        notes: "Maskenmaß 57",
      }),
      row("old", "actors", { name: "Früher", ensembleSeasons: ["2025/2026"] }),
    ];
    const casting = row("cast", "casting", { actorId: "shared", productionId: "old-production" });
    const input = {
      kind: "actors" as const,
      records: actors,
      members: [],
      organization: "Theater",
      department: "Maske",
      references: { casting: [casting] },
    };
    const json = JSON.parse(
      new TextDecoder().decode(
        (await buildExport({ ...input, format: "json", season: "2026 / 27" })).bytes,
      ),
    );
    expect(json.records.map((actor: DomainRecord) => actor.id)).toEqual(["shared"]);
    expect(json.records[0].data).toEqual(actors[0].data);
    const csv = new TextDecoder().decode(
      (await buildExport({ ...input, format: "csv", season: "2025/2026" })).bytes,
    );
    expect(csv).toContain("Spielzeiten");
    expect(csv).toContain("Früher");
    expect(csv).toContain("2025/2026, 2026/2027");
    expect(casting.data).toEqual({ actorId: "shared", productionId: "old-production" });
  });
});
