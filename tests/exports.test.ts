import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import sharp from "sharp";
import { buildExport } from "../src/modules/exports";
import { foldIcs } from "../src/modules/exports/ical";
import { expandCalendar } from "../src/modules/exports/calendar";
import { expandTime } from "../src/modules/exports/time";
import type { DomainRecord } from "../src/shared/contracts";
import type { ExportInput } from "../src/modules/exports/types";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfOptions = {
  standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
};
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "org",
  departmentId: "dept",
  createdBy: "user",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 1,
});
const input = (
  kind: string,
  format: ExportInput["format"],
  records: DomainRecord[],
): ExportInput => ({
  kind,
  format,
  records,
  members: [{ id: "user", name: "Klara Weiß", username: "klara", role: "user", status: "active" }],
  organization: "Testtheater",
  department: "Maske",
});
describe("authorized in-memory exports", () => {
  it("writes German BOM CSV, multiline quotes and neutralizes spreadsheet formulas", async () => {
    const result = await buildExport(
      input("tasks", "csv", [
        record("tasks", "t", {
          title: '  =HYPERLINK("evil")',
          description: 'Änderung; "prüfen"\nNeue Zeile',
          assigneeIds: ["user"],
        }),
      ]),
    );
    expect([...result.bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain('"\'  =HYPERLINK(""evil"")"');
    expect(text).toContain('Änderung; ""prüfen""\nNeue Zeile');
    expect(text).toContain('"Klara Weiß"');
  });
  it("writes a real workbook with local dates, durations, frozen headings and totals", async () => {
    const result = await buildExport(
      input("time", "xlsx", [
        record("time", "t", {
          title: "+attack",
          durationSeconds: 6300,
          userId: "user",
          date: "2026-09-30",
          start: "2026-09-30T13:30:00Z",
        }),
      ]),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(result.bytes).buffer);
    const sheet = workbook.getWorksheet("Daten")!;
    expect(sheet.getCell("D5").value).toBe("'+attack");
    const duration = sheet.getCell("E5").value as Date;
    expect(duration.getUTCHours() * 3600 + duration.getUTCMinutes() * 60).toBe(6300);
    expect(sheet.getCell("E5").numFmt).toBe("[h]:mm");
    expect((sheet.getCell("A5").value as Date).getUTCHours()).toBe(15);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
    const total = workbook.getWorksheet("Summen")!.getCell("B3").value as Date;
    expect(total.getUTCHours() * 3600 + total.getUTCMinutes() * 60).toBe(6300);
  });
  it("escapes ICS values and folds by UTF-8 bytes, including surrogate pairs", async () => {
    const title = "Probe, Ännchen; Haar\\Maske\nZeile ".repeat(10);
    const result = await buildExport(
      input("events", "ics", [
        record("events", "event\nunsafe", {
          title,
          start: "2026-10-01T08:00:00Z",
          end: "2026-10-01T09:00:00Z",
          participantIds: ["user"],
          recurrence: "weekly",
          until: "2026-11-01",
          exceptions: ["2026-10-08"],
        }),
      ]),
    );
    const text = new TextDecoder().decode(result.bytes);
    expect(text).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261101T225959Z");
    expect(text).toContain("EXDATE;TZID=Europe/Berlin:20261008T100000");
    expect(text).toContain("UID:event%0Aunsafe@digitalmask");
    expect(text.replace(/\r\n /g, "")).toContain(
      "SUMMARY:Probe\\, Ännchen\\; Haar\\\\Maske\\nZeile",
    );
    expect(text.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(foldIcs("SUMMARY:" + "🎭ä".repeat(60)).replace(/\r\n /g, "")).toBe(
      "SUMMARY:" + "🎭ä".repeat(60),
    );
  });
  it("keeps recurring local times through DST and excludes local exception dates", () => {
    const expanded = expandCalendar({
      ...input("events", "pdf", [
        record("events", "e", {
          title: "Probe",
          start: "2026-10-18T08:00:00Z",
          end: "2026-10-18T09:00:00Z",
          recurrence: "weekly",
          exceptions: ["2026-11-01"],
        }),
      ]),
      from: "2026-10-18",
      to: "2026-11-08",
    });
    expect(expanded.records.map((r) => r.data.start)).toEqual([
      "2026-10-18T08:00:00.000Z",
      "2026-10-25T09:00:00.000Z",
      "2026-11-08T09:00:00.000Z",
    ]);
  });
  it("retains full multiline data in the versioned JSON export without references", async () => {
    const original = record("looks", "look", {
      title: "Käthe",
      steps: "Alle Schritte\nZweite Zeile",
      imageIds: ["private"],
    });
    const result = await buildExport({
      ...input("looks", "json", [original]),
      references: { actors: [record("actors", "not-exported", { name: "Restricted" })] },
    });
    const payload = JSON.parse(new TextDecoder().decode(result.bytes));
    expect(payload.schemaVersion).toBe(1);
    expect(payload.records).toEqual([original]);
    expect(new TextDecoder().decode(result.bytes)).not.toContain("Restricted");
  });
  it("exports all non-recurring dates when no explicit calendar window is provided", async () => {
    const records = [
      record("events", "early", {
        title: "EARLY",
        start: "2026-09-01T08:00:00Z",
        end: "2026-09-01T09:00:00Z",
      }),
      record("events", "late", {
        title: "LATE",
        start: "2026-09-30T08:00:00Z",
        end: "2026-09-30T09:00:00Z",
      }),
    ];
    expect(
      new TextDecoder().decode((await buildExport(input("events", "csv", records))).bytes),
    ).toContain("LATE");
  });
  it("counts only allocated local-day seconds at a reporting boundary", async () => {
    const booking = record("time", "overnight", {
      title: "Vorstellung über Mitternacht",
      date: "2026-09-30",
      start: "2026-09-30T21:00:00Z",
      end: "2026-10-01T01:00:00Z",
      durationSeconds: 14400,
      userId: "user",
      dayAllocations: [
        { date: "2026-09-30", seconds: 3600 },
        { date: "2026-10-01", seconds: 10800 },
      ],
    });
    const source = { ...input("time", "csv", [booking]), from: "2026-10-01", to: "2026-10-01" };
    const expanded = expandTime(source);
    expect(expanded.records).toHaveLength(1);
    expect(expanded.records[0].data.durationSeconds).toBe(10800);
    const csv = new TextDecoder().decode((await buildExport(source)).bytes);
    expect(csv).toContain("01.10.2026");
    expect(csv).toContain("3:00 h");
    expect(csv).not.toContain("30.09.2026");
    expect(
      expandTime(input("time", "pdf", [booking])).records.reduce(
        (sum, r) => sum + Number(r.data.durationSeconds),
        0,
      ),
    ).toBe(14400);
  });
  it("keeps very long Excel notes printable on continuation rows without duplicate durations", async () => {
    const note = "Lange Tätigkeit mit vielen Details. ".repeat(160) + "EXCELFINALMARKER";
    const result = await buildExport(
      input("time", "xlsx", [
        record("time", "long", {
          title: note,
          durationSeconds: 7200,
          date: "2026-09-30",
          userId: "user",
        }),
      ]),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(result.bytes).buffer);
    const sheet = workbook.getWorksheet("Daten")!;
    let titles = "",
      durationCells = 0;
    for (let r = 5; r <= sheet.rowCount; r++) {
      titles += String(sheet.getCell(r, 4).value ?? "");
      if (sheet.getCell(r, 5).value) durationCells++;
      expect(sheet.getRow(r).height).toBeLessThan(409);
    }
    expect(titles).toContain("EXCELFINALMARKER");
    expect(durationCells).toBe(1);
  });
  it("embeds stored WEBP images in PDF look sheets", async () => {
    const image = await sharp({
      create: { width: 50, height: 40, channels: 3, background: "#1e5f50" },
    })
      .webp()
      .toBuffer();
    const result = await buildExport({
      ...input("looks", "pdf", [
        record("looks", "look", { title: "Testlook", steps: "Schritt eins", imageIds: ["image"] }),
      ]),
      images: { image },
    });
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: result.bytes, ...pdfOptions }).promise;
    const imageOps = new Set(
      Object.entries(OPS)
        .filter(([name]) => name.startsWith("paintImage") || name.includes("ImageMask"))
        .map(([, id]) => id),
    );
    let hasImage = false;
    for (let p = 1; p <= doc.numPages; p++) {
      const operators = await (await doc.getPage(p)).getOperatorList();
      hasImage ||= operators.fnArray.some((fn) => imageOps.has(fn));
    }
    expect(hasImage).toBe(true);
    await doc.cleanup();
    // First PDF test includes cold renderer/font imports and PDF.js verification; concurrent build workers can consume the CPU budget.
  }, 60000);
  it("paginates long PDF rows, repeats headings and includes the last entry", async () => {
    const records = Array.from({ length: 38 }, (_, i) =>
      record("tasks", String(i), {
        title: `Aufgabe ${i} · Überprüfung`,
        description:
          `Zeile ${i} ` +
          "Lange Beschreibung für die Prüfung der Seitenumbrüche. ".repeat(i === 5 ? 95 : 8) +
          ` ENDMARKER${i}`,
        assigneeIds: ["user"],
        due: "2026-09-30",
      }),
    );
    const result = await buildExport(input("tasks", "pdf", records));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: result.bytes, ...pdfOptions }).promise;
    expect(doc.numPages).toBeGreaterThan(2);
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p),
        content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      expect(pageText).toContain("Aufgaben");
      expect(pageText).toContain("Verantwortlich");
      expect(pageText).toMatch(/Seite \d+ von \d+/);
      text += pageText;
    }
    for (let i = 0; i < 38; i++) expect(text).toContain(`ENDMARKER${i}`);
    await doc.cleanup();
  }, 30000);
  it("includes every dense calendar entry in the agenda supplement", async () => {
    const records = Array.from({ length: 18 }, (_, i) =>
      record("events", `e${i}`, {
        title: `Probe KALENDERMARKER${i}`,
        start: "2026-09-30T08:00:00Z",
        end: "2026-09-30T09:00:00Z",
        participantIds: ["user"],
      }),
    );
    const result = await buildExport({
      ...input("events", "pdf", records),
      from: "2026-09-01",
      to: "2026-09-30",
      view: "month",
    });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: result.bytes, ...pdfOptions }).promise;
    const texts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++)
      texts.push(
        (await (await doc.getPage(p)).getTextContent()).items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    expect(texts[0]).toContain("Agenda");
    for (let i = 0; i < 18; i++) expect(texts.join(" ")).toContain(`KALENDERMARKER${i}`);
    await doc.cleanup();
  }, 30000);
});
