import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { buildExport } from "../src/modules/exports";
import { exportTimeDayMarkers } from "../src/modules/exports/time";
import type { ExportInput } from "../src/modules/exports/types";
import type { DomainRecord, Member } from "../src/shared/contracts";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const member: Member = {
  id: "mara",
  name: "Mara Beispiel",
  username: "mara",
  role: "user",
  status: "active",
};
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: Record<string, unknown>,
): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "fictional",
  departmentId: "mask",
  createdBy: "mara",
  createdAt: "2026-10-04T08:00Z",
  updatedAt: "2026-10-04T08:00Z",
  version: 1,
});
const input = (kind: "time" | "attendance", format: ExportInput["format"]): ExportInput => ({
  kind,
  format,
  members: [member],
  organization: "Fiktives Theater",
  department: "Maske",
  from: "2026-09-21",
  to: "2026-09-27",
  userIds: [member.id],
  records: [
    record(kind, "work", {
      title: "Besprechung",
      category: "office",
      userId: member.id,
      date: "2026-09-22",
      durationSeconds: 7200,
      pauseSeconds: 0,
    }),
  ],
  references: {
    events: [
      record("events", "abf", {
        category: "abf",
        allDay: true,
        participantIds: [member.id],
        start: "2026-09-21T00:00+02:00",
        end: "2026-09-22T00:00+02:00",
      }),
      record("events", "rest", {
        category: "rest",
        allDay: true,
        participantIds: [member.id],
        start: "2026-09-26T00:00+02:00",
        end: "2026-09-27T00:00+02:00",
      }),
      record("events", "plan", {
        category: "service",
        participantIds: [member.id],
        start: "2026-09-24T09:00+02:00",
        end: "2026-09-24T12:00+02:00",
      }),
    ],
  },
});

describe("time exports with separate calendar day labels", () => {
  it("filters supplementary labels by person/period without inventing booking rows", async () => {
    expect(exportTimeDayMarkers(input("attendance", "json")).map((marker) => marker.label)).toEqual(
      ["ABF", "Ruhetag"],
    );
    expect(exportTimeDayMarkers({ ...input("time", "json"), userIds: [] })).toEqual([]);
    expect(exportTimeDayMarkers({ ...input("time", "json"), year: 2027 })).toEqual([]);
    const output = JSON.parse(
      new TextDecoder().decode((await buildExport(input("attendance", "json"))).bytes),
    );
    expect(output.records).toHaveLength(1);
    expect(output.attendanceSummary.totalSeconds).toBe(7200);
    expect(output.calendarDayLabels).toHaveLength(2);
    expect(output.calendarDayLabels[0]).not.toHaveProperty("durationSeconds");
    const csv = new TextDecoder().decode((await buildExport(input("time", "csv"))).bytes);
    expect(csv).toContain("Besprechung");
    expect(csv).not.toContain("Ruhetag");
  });
  it("adds an XLSX metadata sheet while keeping booked duration sums unchanged", async () => {
    const result = await buildExport(input("time", "xlsx"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(result.bytes) as never);
    expect(workbook.getWorksheet("Daten")?.rowCount).toBe(5);
    expect(workbook.getWorksheet("Summen")?.getCell("B3").value).toEqual(
      new Date("1899-12-30T02:00:00.000Z"),
    );
    expect(workbook.getWorksheet("Kalenderkennzeichen")?.getCell("D4").value).toBe("ABF");
    expect(workbook.getWorksheet("Kalenderkennzeichen")?.getCell("D5").value).toBe("Ruhetag");
    expect(workbook.getWorksheet("Kalenderkennzeichen")?.getCell("A1").value).toContain(
      "keine Zeitbuchungen",
    );
  });
  it("includes the seven-day weekly PDF overview with no planned or non-working hours", async () => {
    const output = await buildExport(input("attendance", "pdf"));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const documentTask = getDocument({
      data: new Uint8Array(output.bytes),
      standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
    });
    const pdf = await documentTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const overview = pages.find((page) => page.includes("Wochenübersicht"));
    expect(overview).toContain("KW 39");
    expect(overview).toContain("ABF");
    expect(overview).toContain("Ruhetag");
    expect(overview).toContain("2:00 h");
    expect(overview).not.toContain("3:00 h");
    expect(overview).toContain("keine Anwesenheits- oder Arbeitsstunden");
    await documentTask.destroy();
  });
});
