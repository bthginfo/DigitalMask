import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D, type Canvas } from "@napi-rs/canvas";
import { format, addDays, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { buildExport, selectExportRecords } from "../src/modules/exports";
import { expandCalendar, localDay } from "../src/modules/exports/calendar";
import { teamCalendarMembers } from "../src/modules/exports/team-calendar";
import type { DomainRecord, Member } from "../src/shared/contracts";
import type { ExportInput } from "../src/modules/exports/types";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const members: Member[] = Array.from({ length: 13 }, (_, i) => ({
  id: `m${i}`,
  name:
    i === 0
      ? "Ännchen Weiß von der Bühnenwerkstatt mit einem sehr langen fiktiven Doppelnamen"
      : `Fiktive Person ${i + 1}`,
  username: `fixture${i}`,
  status: "active",
  role: "user",
}));
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
): DomainRecord => ({
  kind,
  id,
  data,
  organizationId: "test",
  departmentId: "mask",
  createdBy: "m0",
  createdAt: "2026-09-30T08:00:00Z",
  updatedAt: "2026-09-30T08:00:00Z",
  version: 1,
});
const base = (
  kind: string,
  format: ExportInput["format"],
  records: DomainRecord[],
): ExportInput => ({
  kind,
  format,
  records,
  members,
  organization: "Fiktives Theater · Exportprüfung",
  department: "Maske",
  from: "2026-10-01",
  to: "2026-10-31",
});
const iso = (day: string, clock: string) =>
  fromZonedTime(`${day}T${clock}`, "Europe/Berlin").toISOString();
const category = record("calendarCategories", "cat", {
  key: "custom-day",
  name: "Änderungsfreier Sonderdienst",
  color: "#8c74ad",
  allDay: true,
});
const production = record("productions", "p", { title: "Der fiktive Zauberwald · Wiederaufnahme" });
const events = Array.from({ length: 31 }, (_, i) => {
  const day = format(addDays(parseISO("2026-10-01"), i), "yyyy-MM-dd");
  return record("events", `event${i}`, {
    title:
      i === 3
        ? "Lange fiktive Dienstbeschreibung für die Dokumentation von Frisuren, Materialien und besonders schnellen Umbauten. ".repeat(
            4,
          ) + "TITELENDE"
        : `Dienst ${i + 1}`,
    start: iso(day, "09:00:00"),
    end: iso(day, "15:30:00"),
    participantIds: [members[i % 13].id],
    category: i % 2 ? "rehearsal" : "service",
  });
});
events.push(
  record("events", "allday", {
    title: "",
    productionId: "p",
    category: "custom-day",
    start: iso("2026-10-24", "00:00:00"),
    end: iso("2026-10-25", "00:00:00"),
    participantIds: members.map((member) => member.id),
    recurrence: "daily",
    until: "2026-10-27",
    exceptions: [],
  }),
);
events.push(
  record("events", "halfday", {
    title: "",
    category: "half-day-off",
    start: iso("2026-10-10", "00:00:00"),
    end: iso("2026-10-11", "00:00:00"),
    participantIds: ["m0"],
  }),
);
for (let i = 0; i < 5; i++)
  events.push(
    record("events", `busy${i}`, {
      title: `Zusätzlicher Dienst ${i} MEHRDIENSTENDE${i}`,
      category: "preparation",
      participantIds: ["m0"],
      start: iso("2026-10-01", `${10 + i}:00:00`),
      end: iso("2026-10-01", `${11 + i}:00:00`),
    }),
  );
const calendar = (format: ExportInput["format"]): ExportInput => ({
  ...base("events", format, events),
  view: "team-month",
  references: { calendarCategories: [category], productions: [production] },
});
const attendance = record("attendance", "overnight", {
  title: "Anwesenheit",
  notes: "Fiktive Buchung über Mitternacht",
  userId: "m0",
  date: "2026-09-30",
  start: "2026-09-30T21:00:00Z",
  end: "2026-10-01T02:00:00Z",
  durationSeconds: 18000,
  pauseSeconds: 0,
  dayAllocations: [
    { date: "2026-09-30", seconds: 3600 },
    { date: "2026-10-01", seconds: 14400 },
  ],
});
let qaDirectory: string | undefined;
async function inspectPdf(bytes: Uint8Array, name: string) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const texts: string[] = [],
    canvases: Canvas[] = [];
  const raster = process.env.EXPORT_RENDER_QA === "1";
  if (raster) {
    qaDirectory ??= await mkdtemp(path.join(tmpdir(), "digitalmask-attendance-calendar-"));
    await writeFile(path.join(qaDirectory, `${name}.pdf`), bytes);
  }
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p),
      viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent(),
      text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    texts.push(text);
    expect(text).toContain(`Seite ${p} von ${pdf.numPages}`);
    for (const item of content.items)
      if ("str" in item && item.str.trim()) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(0);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(item.transform[5]).toBeGreaterThanOrEqual(0);
        expect(item.transform[5]).toBeLessThanOrEqual(viewport.height);
        // Footer is deliberately stamped at y20; all other text stays above its reserved band.
        if (item.transform[5] > 40) expect(item.transform[5]).toBeGreaterThanOrEqual(47);
      }
    if (raster) {
      const canvas = createCanvas(
        Math.ceil(viewport.width * 1.2),
        Math.ceil(viewport.height * 1.2),
      );
      await page.render({
        canvas: canvas as never,
        canvasContext: canvas.getContext("2d") as never,
        viewport: page.getViewport({ scale: 1.2 }),
      }).promise;
      await writeFile(path.join(qaDirectory!, `${name}-${p}.png`), canvas.toBuffer("image/png"));
      canvases.push(canvas);
    }
  }
  if (raster) {
    for (let offset = 0; offset < canvases.length; offset += 9) {
      const group = canvases.slice(offset, offset + 9),
        sheet = createCanvas(1500, Math.ceil(group.length / 3) * 570),
        context = sheet.getContext("2d");
      context.fillStyle = "#dde3de";
      context.fillRect(0, 0, sheet.width, sheet.height);
      group.forEach((canvas, i) => {
        const scale = Math.min(480 / canvas.width, 530 / canvas.height);
        context.drawImage(
          canvas,
          (i % 3) * 500 + 10,
          Math.floor(i / 3) * 570 + 25,
          canvas.width * scale,
          canvas.height * scale,
        );
        context.fillStyle = "#173f39";
        context.font = "16px sans-serif";
        context.fillText(
          `${name} · Seite ${offset + i + 1}`,
          (i % 3) * 500 + 10,
          Math.floor(i / 3) * 570 + 18,
        );
      });
      await writeFile(
        path.join(qaDirectory!, `${name}-contact-${offset / 9 + 1}.png`),
        sheet.toBuffer("image/png"),
      );
    }
    console.log(`Export raster QA: ${name}, ${pdf.numPages} pages, ${qaDirectory}`);
  }
  const count = pdf.numPages;
  await pdf.cleanup();
  return { pages: count, texts, text: texts.join(" ") };
}

describe("attendance and configurable calendar exports", () => {
  it("keeps attendance separate, counts only allocated selected days and preserves historical names", async () => {
    const historic = { ...members[0], status: "disabled" as Member["status"] };
    const data = {
      ...base("attendance", "csv", [
        attendance,
        record("time", "productiontime", {
          title: "NOT_ATTENDANCE",
          durationSeconds: 99999,
          userId: "m0",
          date: "2026-10-01",
          productionId: "p",
        }),
      ]),
      members: [historic],
      userIds: ["m0"],
    };
    const csv = new TextDecoder().decode((await buildExport(data)).bytes);
    expect(csv).toContain("01.10.2026");
    expect(csv).toContain("4:00 h");
    expect(csv).toContain(historic.name);
    expect(csv).not.toContain("30.09.2026");
    expect(csv).not.toContain("NOT_ATTENDANCE");
    expect(csv).not.toContain("Produktion");
    const json = JSON.parse(
      new TextDecoder().decode((await buildExport({ ...data, format: "json" })).bytes),
    );
    expect(json.records[0].id).toBe("overnight");
    expect(json.attendanceSummary).toMatchObject({
      totalSeconds: 14400,
      days: { "2026-10-01": 14400 },
      weeks: { "2026 / KW 40": 14400 },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array((await buildExport({ ...data, format: "xlsx" })).bytes).buffer,
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Daten",
      "Personensummen",
      "Tagessummen",
      "Wochensummen",
    ]);
    expect(workbook.getWorksheet("Daten")!.getCell("E5").numFmt).toBe("[h]:mm");
    expect(workbook.getWorksheet("Tagessummen")!.getCell("A2").value).toBe("2026-10-01");
  });
  it("uses renamed category/title fallbacks and RFC DATE all-day recurrence with exclusive ends", async () => {
    const ics = new TextDecoder()
      .decode((await buildExport({ ...calendar("ics"), records: [events[31], events[32]] })).bytes)
      .replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:Der fiktive Zauberwald · Wiederaufnahme");
    expect(ics).toContain("CATEGORIES:Änderungsfreier Sonderdienst");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261024");
    expect(ics).toContain("DTEND;VALUE=DATE:20261025");
    expect(ics).toContain("RRULE:FREQ=DAILY;UNTIL=20261027");
    expect(ics).toContain("SUMMARY:Halber freier Tag");
    expect(events[31].data.title).toBe("");
    const expanded = expandCalendar({ ...calendar("pdf"), records: [events[31]] });
    expect(expanded.records).toHaveLength(4);
    expect(expanded.records.map((item) => localDay(new Date(String(item.data.start))))).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
    expect(
      expanded.records.map(
        (item) => (+new Date(String(item.data.end)) - +new Date(String(item.data.start))) / 3600000,
      ),
    ).toEqual([24, 25, 24, 24]);
    const csv = new TextDecoder().decode(
      (await buildExport({ ...calendar("csv"), records: [events[31]] })).bytes,
    );
    expect(csv).toContain("Ganztägig");
    expect(csv).not.toContain("00:00");
    expect(csv).toContain("Änderungsfreier Sonderdienst");
  });
  it("preserves local timed recurrence endpoints across the DST switch", () => {
    const event = record("events", "timed", {
      title: "Nachtprobe",
      category: "service",
      participantIds: ["m0"],
      start: iso("2026-10-24", "01:30:00"),
      end: iso("2026-10-24", "03:30:00"),
      recurrence: "daily",
      until: "2026-10-26",
    });
    const result = expandCalendar({ ...calendar("pdf"), records: [event] });
    expect(
      result.records.map(
        (item) => (+new Date(String(item.data.end)) - +new Date(String(item.data.start))) / 3600000,
      ),
    ).toEqual([2, 3, 2]);
  });
  it("filters selected calendars and includes only active staff in team grids", async () => {
    expect(
      selectExportRecords({ kind: "events", records: events, userIds: ["m1"] }).every((item) =>
        (item.data.participantIds as string[]).includes("m1"),
      ),
    ).toBe(true);
    const input = {
      ...calendar("xlsx"),
      userIds: ["m1"],
      members: [
        ...members,
        { ...members[0], id: "sup", name: "NOT_STAFF", role: "superadmin" as const },
        {
          ...members[0],
          id: "inactive",
          name: "NOT_ACTIVE",
          status: "disabled" as Member["status"],
        },
      ],
    };
    expect(teamCalendarMembers(input).map((member) => member.id)).toEqual(["m1"]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array((await buildExport(input)).bytes).buffer);
    const grids = workbook.worksheets.filter((sheet) => sheet.name.startsWith("Team "));
    expect(grids).toHaveLength(1);
    for (const grid of grids) {
      expect(grid.columnCount).toBe(17);
      expect(grid.views[0]).toMatchObject({ xSplit: 1, ySplit: 1 });
      expect(grid.pageSetup.printTitlesRow).toBe("1:1");
      expect(grid.getCell("A3").value).toBe("Fiktive Person 2");
      const text = grid.getSheetValues().flat().join(" ");
      expect(text).toContain("01.10.");
      expect(text).toContain("31.10.");
      expect(text).not.toContain("NOT_STAFF");
      expect(text).not.toContain("NOT_ACTIVE");
    }
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Team 10-2026"]);
  });
  it("prints all 31 days and 13 staff with complete dense entries instead of agenda previews", async () => {
    const pdf = await inspectPdf((await buildExport(calendar("pdf"))).bytes, "team-month");
    expect(pdf.pages).toBeLessThan(15);
    for (let i = 1; i < 13; i++) expect(pdf.text).toContain(`Fiktive Person ${i + 1}`);
    expect(pdf.text).toContain("31.10.");
    expect(pdf.text).toContain("TITELENDE");
    expect(pdf.text).toContain("MEHRDIENSTENDE4");
    expect(pdf.text).toContain("Änderungsfreier Sonderdienst");
    expect(pdf.text).toContain("Halber freier Tag");
    expect(pdf.text).not.toContain("Agenda");
    expect(pdf.text).not.toContain("DIGITALMASK /");
    expect(pdf.text).not.toContain("Personengruppe");
  }, 60000);
  it("fits five staff and two complete weeks on one A4 landscape sheet and exports coloured month cells", async () => {
    const staff = members.slice(1, 6);
    const short = staff.flatMap((member, index) =>
      Array.from({ length: 14 }, (_, dayIndex) => {
        const day = format(addDays(parseISO("2026-10-05"), dayIndex), "yyyy-MM-dd");
        return record("events", `short-${index}-${dayIndex}`, {
          title: `Probe M${index}D${dayIndex}`,
          category: "rehearsal",
          start: iso(day, "10:00:00"),
          end: iso(day, "12:00:00"),
          participantIds: [member.id],
        });
      }),
    );
    short.push(
      ...[0, 1].map((index) =>
        record("events", `extra-${index}`, {
          title: `Zusatz ENDE${index}`,
          category: "service",
          start: iso("2026-10-05", `${14 + index}:00:00`),
          end: iso("2026-10-05", `${15 + index}:00:00`),
          participantIds: [staff[0].id],
        }),
      ),
    );
    const input: ExportInput = {
      ...calendar("pdf"),
      members: staff,
      records: short,
      from: "2026-10-05",
      to: "2026-10-18",
    };
    const pdf = await inspectPdf((await buildExport(input)).bytes, "team-two-weeks");
    expect(pdf.pages).toBe(1);
    expect(pdf.text).toContain("KW 41");
    expect(pdf.text).toContain("KW 42");
    for (const member of staff) expect(pdf.text).toContain(member.name);
    expect(pdf.text).toContain("ENDE1");
    expect(pdf.text).toContain("Probe M4D13");
    expect(pdf.text).not.toContain("Agenda");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array(
        (await buildExport({ ...input, format: "xlsx", from: "2026-10-01", to: "2026-10-31" }))
          .bytes,
      ).buffer,
    );
    const sheet = workbook.worksheets[0];
    const text = sheet.getSheetValues().flat().join(" ");
    expect(text).toContain("Probe M4D13");
    expect(text).toContain("ENDE1");
    let coloured = 0;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (String(cell.value ?? "").includes("Probe M")) {
          expect(cell.fill.type).toBe("pattern");
          if (cell.fill.type === "pattern") expect(cell.fill.pattern).toBe("solid");
          coloured++;
        }
      }),
    );
    expect(coloured).toBe(70);
    expect(sheet.pageSetup).toMatchObject({
      paperSize: 9,
      orientation: "landscape",
      fitToWidth: 1,
    });
  }, 60000);
  it("prints multipage attendance with separate person/day/week totals and no production headings", async () => {
    const records = Array.from({ length: 29 }, (_, i) =>
      record("attendance", `presence${i}`, {
        title: "Anwesenheit",
        userId: members[i % 13].id,
        date: format(addDays(parseISO("2026-10-01"), i), "yyyy-MM-dd"),
        durationSeconds: 3600,
        notes:
          "Fiktive Arbeitsanwesenheit und Hinweise für einen gut lesbaren gedruckten Nachweis. ".repeat(
            i === 4 ? 18 : 2,
          ) + `ANWESENHEITENDE${i}`,
      }),
    );
    const pdf = await inspectPdf(
      (await buildExport(base("attendance", "pdf", records))).bytes,
      "attendance",
    );
    expect(pdf.pages).toBeGreaterThan(5);
    expect(pdf.text).toContain("Personensummen");
    expect(pdf.text).toContain("Tagessummen");
    expect(pdf.text).toContain("Wochensummen");
    expect(pdf.text).toContain("29:00 h");
    expect(pdf.text).not.toContain("Produktionszeit");
    for (let i = 0; i < 29; i++) expect(pdf.text).toContain(`ANWESENHEITENDE${i}`);
  }, 60000);
});
