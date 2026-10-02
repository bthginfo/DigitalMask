import { describe, expect, it } from "vitest";
import {
  seasonBounds,
  seasonForDate,
  dateMatchesPeriod,
  recordMatchesPeriod,
} from "../src/shared/period-filter";
import { buildExport } from "../src/modules/exports";
import type { DomainRecord } from "../src/shared/contracts";

const row = (kind: DomainRecord["kind"], data: DomainRecord["data"]): DomainRecord => ({
  id: "fixture",
  kind,
  data,
  organizationId: "fixture",
  departmentId: "fixture",
  createdBy: "fixture",
  version: 1,
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-01T08:00:00Z",
});
describe("current theatre season", () => {
  it("handles existing short and spaced season labels and the Berlin midnight boundary", () => {
    expect(seasonBounds("2026 / 27")).toEqual({ from: "2026-08-01", to: "2027-08-01" });
    expect(seasonBounds("2026–2027")).toEqual(seasonBounds("2026/27"));
    expect(seasonBounds("2026/2028")).toBeUndefined();
    expect(
      seasonForDate(
        [row("productions", { season: "2026 / 27" })],
        new Date("2026-10-01T08:00:00Z"),
      ),
    ).toBe("2026 / 27");
    expect(seasonForDate([], new Date("2026-07-31T21:59:00Z"))).toBe("2025/2026");
    expect(seasonForDate([], new Date("2026-07-31T22:01:00Z"))).toBe("2026/2027");
  });
  it("filters attendance without a production and recurring events by actual dates", () => {
    const period = { season: "2026/27" };
    expect(dateMatchesPeriod("2027-07-31", period)).toBe(true);
    expect(dateMatchesPeriod("2027-08-01", period)).toBe(false);
    expect(recordMatchesPeriod(row("attendance", { date: "2025-12-01" }), period)).toBe(false);
    expect(
      recordMatchesPeriod(
        row("attendance", {
          dayAllocations: [
            { date: "2026-07-31", seconds: 3600 },
            { date: "2026-08-01", seconds: 3600 },
          ],
        }),
        period,
      ),
    ).toBe(true);
    expect(
      recordMatchesPeriod(
        row("events", { start: "2025-09-01T08:00:00Z", recurrence: "weekly", until: "2027-07-01" }),
        period,
      ),
    ).toBe(true);
    expect(
      recordMatchesPeriod(
        row("events", { start: "2025-09-01T08:00:00Z", recurrence: "weekly", until: "2026-07-01" }),
        period,
      ),
    ).toBe(false);
  });
  it("keeps equivalent production season labels together and allows all seasons", () => {
    for (const season of ["2026/27", "2026 / 2027", "2026–2027"])
      expect(recordMatchesPeriod(row("productions", { season }), { season: "2026/2027" })).toBe(
        true,
      );
    expect(
      recordMatchesPeriod(row("productions", { season: "2025/26" }), { season: "2026/27" }),
    ).toBe(false);
    expect(recordMatchesPeriod(row("productions", { season: "2025/26" }), {})).toBe(true);
  });
  it("clips exported overnight attendance to the chosen season", async () => {
    const record = row("attendance", {
      userId: "fixture",
      date: "2026-07-31",
      durationSeconds: 7200,
      dayAllocations: [
        { date: "2026-07-31", seconds: 3600 },
        { date: "2026-08-01", seconds: 3600 },
      ],
    });
    const result = await buildExport({
      kind: "attendance",
      format: "json",
      season: "2026/27",
      records: [record],
      members: [],
      organization: "Fixture",
      department: "Fixture",
    });
    const json = JSON.parse(new TextDecoder().decode(result.bytes));
    expect(json.attendanceSummary.totalSeconds).toBe(3600);
    expect(Object.keys(json.attendanceSummary.days)).toEqual(["2026-08-01"]);
  });
});
