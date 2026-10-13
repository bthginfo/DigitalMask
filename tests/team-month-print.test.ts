import { describe, expect, it } from "vitest";
import { calendarPrintEntry } from "@/modules/exports/team-calendar-print";
import { teamMonthPrintBlocks } from "@/modules/exports/team-month-print-layout";
import type { DomainRecord } from "@/shared/contracts";
import type { ExportInput } from "@/modules/exports/types";

const row = (
  kind: DomainRecord["kind"],
  data: DomainRecord["data"],
  id: string = kind,
): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "fictional",
  departmentId: "makeup",
  createdBy: "author",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-01T08:00:00Z",
  version: 1,
});
const input: ExportInput = {
  kind: "events",
  format: "pdf",
  view: "team-month",
  records: [],
  members: [],
  organization: "Fiktives Theater",
  department: "Maske",
  from: "2026-10-01",
  to: "2026-10-31",
  references: {
    productions: [row("productions", { title: "Gym", color: "#aabbcc" }, "gym")],
    calendarCategories: [
      row("calendarCategories", { key: "planning", name: "Konzeption", color: "#77818e" }, "konzi"),
      row(
        "calendarCategories",
        { key: "day-service", name: "Tagesdienst", color: "#77818e" },
        "tg",
      ),
      row(
        "calendarCategories",
        { key: "half", name: "Halber freier Tag", color: "#77818e", allDay: true },
        "hft",
      ),
    ],
  },
};
const event = (data: DomainRecord["data"]) =>
  row("events", {
    title: "",
    start: "2026-10-01T09:00:00+02:00",
    end: "2026-10-01T16:00:00+02:00",
    ...data,
  });

describe("team-month print labels", () => {
  it("prints only the production title for performances without changing other formats", () => {
    const record = event({
      category: "performance",
      productionId: "gym",
      title: "Erste Vorstellung",
    });
    expect(calendarPrintEntry(record, input)).toMatchObject({
      title: "Gym",
      time: "",
      color: "#aabbcc",
    });
    expect(calendarPrintEntry(record, { ...input, format: "xlsx" }).title).toContain("Vorstellung");
    expect(calendarPrintEntry(record, { ...input, view: "team" }).time).toContain("09:00");
    expect(record.data.title).toBe("Erste Vorstellung");
    expect(
      calendarPrintEntry(event({ category: "performance", title: "Gastspiel" }), input).title,
    ).toBe("Gastspiel");
  });
  it("abbreviates standard and administrator-defined categories while preserving colors and extra titles", () => {
    for (const category of ["half-day-off", "half"]) {
      expect(calendarPrintEntry(event({ category }), input)).toMatchObject({
        title: "HFT",
        time: "",
      });
    }
    for (const category of ["service", "day-service"]) {
      expect(calendarPrintEntry(event({ category, title: "Tagesdienst" }), input).title).toBe("TG");
    }
    expect(calendarPrintEntry(event({ category: "planning" }), input).title).toBe("Konzi");
    expect(
      calendarPrintEntry(
        event({ category: "planning", productionId: "gym", title: "Perücken" }),
        input,
      ).title,
    ).toBe("Gym – Konzi · Perücken");
    expect(
      calendarPrintEntry(event({ category: "rehearsal", title: "Probe, alle Szenen" }), input)
        .title,
    ).toBe("Probe, alle Szenen");
  });
});

describe("team-month print clock ranges", () => {
  it("keeps nonzero minutes while omitting redundant zeros", () => {
    expect(calendarPrintEntry(event({ category: "service" }), input).time).toBe("9–16");
    expect(
      calendarPrintEntry(
        event({
          category: "service",
          start: "2026-10-01T09:15:00+02:00",
          end: "2026-10-01T16:45:00+02:00",
        }),
        input,
      ).time,
    ).toBe("9:15–16:45");
  });
});

describe("complete month print boundaries", () => {
  for (const [month, last] of [
    ["2026-02", 28],
    ["2028-02", 29],
    ["2026-04", 30],
    ["2026-10", 31],
  ] as const) {
    it(`keeps every day of ${month} exactly once across two pages`, () => {
      const blocks = teamMonthPrintBlocks({
        ...input,
        from: `${month}-01`,
        to: `${month}-${last}`,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0].days).toHaveLength(14);
      expect(blocks[0].days.at(-1)).toBe(`${month}-14`);
      expect(blocks[1].days[0]).toBe(`${month}-15`);
      expect(blocks[1].days.at(-1)).toBe(`${month}-${last}`);
      expect(new Set(blocks.flatMap((block) => block.days)).size).toBe(last);
    });
  }
});
