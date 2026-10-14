import { describe, expect, it } from "vitest";
import {
  calendarPrintEntry,
  calendarPrintDayBackground,
} from "@/modules/exports/team-calendar-print";
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
      row("calendarCategories", { key: "show", name: "Vorstellungen", color: "#77818e" }, "show"),
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
  it("prints the performance start and compact production title in PDF and XLSX while keeping data exports intact", () => {
    const record = event({
      category: "performance",
      productionId: "gym",
      title: "Erste Vorstellung",
    });
    expect(calendarPrintEntry(record, input)).toMatchObject({
      title: "Gym",
      time: "09:00",
      color: "#aabbcc",
    });
    expect(calendarPrintEntry(record, { ...input, format: "xlsx" })).toMatchObject({
      title: "Gym",
      time: "09:00",
    });
    expect(calendarPrintEntry(record, { ...input, format: "csv" }).title).toContain("Vorstellung");
    expect(calendarPrintEntry(record, { ...input, view: "team" }).time).toContain("09:00");
    expect(record.data.title).toBe("Erste Vorstellung");
    expect(
      calendarPrintEntry(event({ category: "performance", title: "Gastspiel" }), input).title,
    ).toBe("Gastspiel");
  });
  it.each(["pdf", "xlsx"] as const)(
    "keeps the start of administrator-defined performances in Berlin time in %s across DST",
    (format) => {
      for (const [date, time] of [
        ["2026-10-24", "19:30"],
        ["2026-10-26", "18:30"],
      ]) {
        const record = event({
          category: "show",
          productionId: "gym",
          start: `${date}T17:30:00Z`,
          end: `${date}T20:00:00Z`,
        });
        expect(calendarPrintEntry(record, { ...input, format })).toMatchObject({
          title: "Gym",
          time,
        });
        expect(
          calendarPrintEntry(
            { ...record, data: { ...record.data, allDay: true } },
            {
              ...input,
              format,
            },
          ).time,
        ).toBe("");
      }
    },
  );
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

describe("all-day print backgrounds", () => {
  it("extends an all-day category's lightened colour behind timed appointments only for that person/day", () => {
    const free = calendarPrintEntry(event({ category: "half" }), input);
    const appointment = calendarPrintEntry(
      event({ category: "performance", productionId: "gym" }),
      input,
    );
    expect(free).toMatchObject({ allDay: true, color: "#bbc0c7" });
    expect(calendarPrintDayBackground([appointment, free])).toBe(free.color);
    expect(calendarPrintDayBackground([appointment])).toBe("#ffffff");
    expect(appointment.color).toBe("#aabbcc");
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
