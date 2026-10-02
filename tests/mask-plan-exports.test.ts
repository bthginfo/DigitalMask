import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { buildExport } from "@/modules/exports";
import { newMaskPlan } from "@/modules/mask-plans/model";
import type { DomainRecord } from "@/shared/contracts";
import type { ExportInput } from "@/modules/exports/types";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const laneId = "11111111-1111-4111-8111-111111111111";
const row = (kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]): DomainRecord => ({
  kind,
  id,
  data,
  organizationId: "organization",
  departmentId: "department",
  createdBy: "staff",
  createdAt: "2026-10-02T10:00:00Z",
  updatedAt: "2026-10-02T10:00:00Z",
  version: 1,
});
const fixture = (format: ExportInput["format"]): ExportInput => ({
  kind: "maskPlans",
  format,
  organization: "Stadttheater Ingolstadt",
  department: "Maske",
  performanceTime: "19:30",
  members: [{ id: "staff", name: "Jules", username: "jules", role: "user", status: "active" }],
  references: {
    productions: [row("productions", "production", { title: "Bär", color: "#785edb" })],
    actors: [row("actors", "actor", { name: "Irina K." })],
  },
  records: [
    row("maskPlans", "plan", {
      ...newMaskPlan("production"),
      title: "AMA, HP1+2, GP, Premiere",
      lanes: [{ id: laneId, label: "Maske", memberIds: ["staff"], staffNames: ["Janine"] }],
      blocks: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          laneId,
          startMinutes: -60,
          durationMinutes: 30,
          actorIds: ["actor"],
          actorNames: [],
          title: "",
          notes: "",
          color: "",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          laneId,
          startMinutes: -30,
          durationMinutes: 10,
          actorIds: [],
          actorNames: ["Ben E.", "Michael A."],
          title: "",
          notes: "",
          color: "#e9ca68",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          laneId,
          startMinutes: -20,
          durationMinutes: 20,
          actorIds: [],
          actorNames: [],
          title: "Ins Studio rüber",
          notes: "",
          color: "#e9ca68",
        },
      ],
    }),
  ],
});
const pdfOptions = {
  standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
};

describe("mask-plan exports", () => {
  it("exports exact relative minutes and readable names in BOM CSV without executing user formulas", async () => {
    const input = fixture("csv");
    (input.records[0].data.blocks as { title: string }[])[1].title = "=HYPERLINK(1)";
    const result = await buildExport(input);
    const text = new TextDecoder().decode(result.bytes);
    expect([...result.bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    expect(text).toContain('"Jules / Janine"');
    expect(text).toContain('"Ben E. / Michael A."');
    expect(text).toContain(";-60;");
    expect(text).toContain('"18:30"');
    expect(text).toContain("'=HYPERLINK(1)");
    expect(text).toContain("Ins Studio rüber");
  });
  it("builds a printable timetable plus numeric block data and preserves overlapping labels", async () => {
    const input = fixture("xlsx");
    const blocks = input.records[0].data.blocks as {
      id: string;
      startMinutes: number;
      durationMinutes: number;
      actorNames: string[];
      title: string;
    }[];
    blocks.push({
      ...blocks[1],
      id: "55555555-5555-4555-8555-555555555555",
      actorNames: ["Parallel"],
      startMinutes: -25,
      durationMinutes: 5,
    });
    const result = await buildExport(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(result.bytes) as never);
    const sheet = workbook.getWorksheet("Plan 1")!;
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(sheet.pageSetup.printTitlesRow).toBe("1:4");
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(sheet.getCell("B4").value).toBe("Maske\nJules / Janine");
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value || ""))));
    expect(values.join(" ")).toContain("Parallel");
    expect(values.join(" ")).toContain("Ben E. / Michael A.");
    expect(values.join(" ")).toContain("0 · Beginn");
    const data = workbook.getWorksheet("Ablauf")!;
    expect(data.getCell("G2").value).toBe(-60);
    expect(data.getCell("H2").value).toBe(-30);
    expect(data.getCell("I2").value).toBe(30);
    expect(data.getCell("J2").value).toBe("18:30");
  });
  it("prints the ordinary one-hour plan on one A4 landscape page with staff, actors and curtain", async () => {
    const result = await buildExport(fixture("pdf"));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: result.bytes.slice(), ...pdfOptions });
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1),
      viewport = page.getViewport({ scale: 1 });
    expect(viewport.width).toBeGreaterThan(viewport.height);
    const content = await page.getTextContent();
    const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ");
    for (const expected of [
      "Jules / Janine",
      "-60 bis -30",
      "Irina K.",
      "Ben E. / Michael A.",
      "Ins Studio rüber",
      "0 · Beginn",
      "19:30",
      "Seite 1 von 1",
    ])
      expect(text).toContain(expected);
    for (const item of content.items)
      if ("str" in item && item.str.trim()) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(25);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 24);
        expect(item.transform[5]).toBeGreaterThanOrEqual(23);
        expect(item.transform[5]).toBeLessThan(viewport.height - 20);
      }
    await task.destroy();
  }, 60_000);
  it("paginates many lanes and long windows and keeps complete notes in the printable details", async () => {
    const input = fixture("pdf");
    const plan = input.records[0].data;
    plan.windowMinutes = 120;
    const baseLane = (
      plan.lanes as { id: string; label: string; memberIds: string[]; staffNames: string[] }[]
    )[0];
    plan.lanes = Array.from({ length: 6 }, (_, index) => ({
      ...baseLane,
      id: index === 0 ? laneId : crypto.randomUUID(),
      label: `Platz ${index + 1}`,
    }));
    const endMarker = "VOLLSTÄNDIGE HINWEISE ENDE";
    plan.notes = `${"Vorbereitung prüfen und Perücke bereitlegen. ".repeat(60)}${endMarker}`;
    const result = await buildExport(input);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: result.bytes.slice(), ...pdfOptions });
    const pdf = await task.promise;
    expect(pdf.numPages).toBeGreaterThanOrEqual(5);
    const text: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index),
        viewport = page.getViewport({ scale: 1 }),
        content = await page.getTextContent();
      for (const item of content.items)
        if ("str" in item && item.str.trim()) {
          text.push(item.str);
          expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 24);
          expect(item.transform[5]).toBeGreaterThanOrEqual(23);
        }
    }
    for (const expected of [
      "Platz 6",
      "Irina K.",
      "Ins Studio rüber",
      endMarker,
      "Vollständiger Ablauf",
    ])
      expect(text.join(" ")).toContain(expected);
    await task.destroy();
  });
});
