import { formatInTimeZone } from "date-fns-tz";
import {
  cellText,
  columnsFor,
  durationSeconds,
  exportRows,
  exportTitle,
  exportPeriod,
} from "./data";
import type { ExportInput } from "./types";
import { durationSummary } from "./duration-summary";
import {
  calendarLegend,
  eventCalendarLabel,
  memberDayEvents,
  teamCalendarMembers,
  teamCalendarWeeks,
} from "./team-calendar";

/** Spreadsheet programs also interpret whitespace-prefixed formulas. */
export function safeSpreadsheetText(value: string): string {
  return /^[\s\uFEFF]*[=+@-]/u.test(value) ? `'${value}` : value;
}
export function csvCell(value: string): string {
  return `"${safeSpreadsheetText(value).replace(/"/g, '""')}"`;
}
function printChunks(text: string, width: number): string[] {
  const capacity = Math.max(12, width - 4),
    lines: string[] = [];
  for (let line of text.split("\n")) {
    while (line.length > capacity) {
      const space = line.lastIndexOf(" ", capacity),
        cut = space > capacity / 2 ? space : capacity;
      lines.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  // Keep copyable names, emails and phone numbers intact. Native wrapText handles ordinary cells;
  // only text exceeding a printable row needs explicit continuation chunks.
  if (lines.length <= 18) return [text];
  return Array.from({ length: Math.max(1, Math.ceil(lines.length / 18)) }, (_, i) =>
    lines.slice(i * 18, i * 18 + 18).join("\n"),
  );
}
export function buildCsv(input: ExportInput): Uint8Array {
  const columns = columnsFor(input.kind, input);
  const lines = [
    columns.map((c) => csvCell(c.label)).join(";"),
    ...exportRows(input).map((row) => columns.map((col) => csvCell(cellText(row, col))).join(";")),
  ];
  return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`);
}
export async function buildXlsx(input: ExportInput): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  workbook.title = exportTitle(input);
  const sheet = workbook.addWorksheet("Daten", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:4",
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  const columns = columnsFor(input.kind, input),
    rows = exportRows(input);
  const excelAllDay: boolean[] = [];
  const excelRows = rows.flatMap((row) => {
    const cells = columns.map((col) => {
      const value = row.values[col.key];
      return typeof value === "string" ? printChunks(value, col.width) : [value];
    });
    return Array.from({ length: Math.max(...cells.map((c) => c.length)) }, (_, segment) => {
      excelAllDay.push(Boolean(row.values.isAllDay));
      return columns.map((col, index) => {
        const value = cells[index][segment] ?? (index === 0 ? "Fortsetzung" : "");
        if (value instanceof Date)
          return new Date(`${formatInTimeZone(value, "Europe/Berlin", "yyyy-MM-dd'T'HH:mm:ss")}Z`);
        return typeof value === "string" ? safeSpreadsheetText(value) : value;
      });
    });
  });
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  // Very wide structured look sheets span horizontal pages at a readable scale.
  sheet.pageSetup.fitToWidth = Math.max(
    1,
    Math.ceil(columns.reduce((sum, col) => sum + col.width, 0) / 135),
  );
  if (["looks", "handovers"].includes(input.kind)) sheet.pageSetup.printTitlesColumn = "A:B";
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = `${exportTitle(input)} · ${input.department}`;
  sheet.getRow(1).height = 29;
  sheet.getCell(1, 1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF173F39" } };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = safeSpreadsheetText(`${input.organization} · ${exportPeriod(input)}`);
  sheet.addTable({
    name: "ExportDaten",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: columns.map((c) => ({ name: c.label, filterButton: true })),
    rows: excelRows,
  });
  for (let r = 5; r < 5 + excelRows.length; r++) {
    const row = sheet.getRow(r);
    row.alignment = { vertical: "top", wrapText: true };
    row.font = { name: "Calibri", size: 11 };
    const estimatedLines = Math.max(
      ...columns.map((col, i) =>
        Math.max(
          1,
          String(excelRows[r - 5][i] ?? "")
            .split("\n")
            .reduce((sum, line) => sum + Math.ceil(line.length / Math.max(10, col.width - 3)), 0),
        ),
      ),
    );
    row.height = Math.min(409, Math.max(24, estimatedLines * 15));
    columns.forEach((col, i) => {
      if (col.type === "duration") row.getCell(i + 1).numFmt = "[h]:mm";
      if (col.type === "date")
        row.getCell(i + 1).numFmt =
          !excelAllDay[r - 5] && (input.kind === "events" || input.kind === "calendar")
            ? "dd.mm.yyyy hh:mm"
            : "dd.mm.yyyy";
    });
  }
  if (input.kind === "time") {
    const summary = workbook.addWorksheet("Summen", { views: [{ state: "frozen", ySplit: 1 }] });
    summary.columns = [
      { header: "Person", key: "person", width: 30 },
      { header: "Stunden", key: "duration", width: 18 },
    ];
    const sums = new Map<string, number>();
    for (const row of rows)
      sums.set(
        String(row.values.person),
        (sums.get(String(row.values.person)) ?? 0) + durationSeconds(row.record),
      );
    for (const [person, seconds] of sums)
      summary.addRow({ person: safeSpreadsheetText(person), duration: seconds / 86400 });
    summary.addRow({
      person: "Gesamt",
      duration: [...sums.values()].reduce((a, b) => a + b, 0) / 86400,
    });
    summary.getColumn(2).numFmt = "[h]:mm";
    summary.getRow(1).font = { bold: true };
    const projects = workbook.addWorksheet("Projektstunden", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    projects.columns = [
      { header: "Produktion / allgemeine Arbeit", key: "production", width: 45 },
      { header: "Stunden", key: "duration", width: 18 },
    ];
    const projectSums = new Map<string, number>();
    for (const row of rows) {
      const name = String(row.values.production) || "Allgemeine Arbeit";
      projectSums.set(name, (projectSums.get(name) ?? 0) + durationSeconds(row.record));
    }
    for (const [production, seconds] of projectSums)
      projects.addRow({ production: safeSpreadsheetText(production), duration: seconds / 86400 });
    projects.getColumn(2).numFmt = "[h]:mm";
    projects.getRow(1).font = { bold: true };
  }
  if (input.kind === "attendance") {
    const summary = durationSummary(rows);
    const definitions = [
      { name: "Personensummen", label: "Person", buckets: summary.people },
      { name: "Tagessummen", label: "Datum", buckets: summary.days },
      { name: "Wochensummen", label: "Kalenderwoche", buckets: summary.weeks },
    ];
    for (const definition of definitions) {
      const summarySheet = workbook.addWorksheet(definition.name, {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: {
          paperSize: 9,
          orientation: "portrait",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:1",
        },
      });
      summarySheet.columns = [
        { header: definition.label, key: "label", width: 40 },
        { header: "Anwesenheit", key: "duration", width: 20 },
      ];
      for (const [label, seconds] of definition.buckets)
        summarySheet.addRow({ label: safeSpreadsheetText(label), duration: seconds / 86400 });
      summarySheet.addRow({ label: "Gesamtanwesenheit", duration: summary.total / 86400 });
      summarySheet.getColumn(2).numFmt = "[h]:mm";
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.headerFooter.oddFooter = "&LDigitalMask · Anwesenheit&C&P / &N";
    }
  }
  if (
    ["events", "calendar"].includes(input.kind) &&
    ["team", "team-month"].includes(input.view ?? "")
  ) {
    const members = teamCalendarMembers(input);
    for (const week of teamCalendarWeeks(input)) {
      const grid = workbook.addWorksheet(`Team ${week.key}`, {
        views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
        pageSetup: {
          paperSize: 9,
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:4",
          printTitlesColumn: "A:A",
        },
      });
      grid.columns = [{ width: 27 }, ...week.days.map(() => ({ width: 18 }))];
      grid.mergeCells("A1:H1");
      grid.getCell("A1").value = "Teamplanung · " + week.label;
      grid.getCell("A1").font = { size: 16, bold: true, color: { argb: "FF1E5F50" } };
      grid.getRow(1).height = 28;
      grid.mergeCells("A2:H2");
      grid.getCell("A2").value = safeSpreadsheetText(
        `${input.organization} · ${input.from} – ${input.to}`,
      );
      grid.mergeCells("A3:H3");
      grid.getCell("A3").value =
        "Vollständige Titel; Fortsetzungszeilen enthalten weitere Dienste. Details im Blatt Daten.";
      grid.getRow(4).values = ["Person", ...week.days];
      grid.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
      grid.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5F50" } };
      grid.getRow(4).height = 24;
      for (const member of members) {
        const texts = week.days.map((day) =>
          memberDayEvents(input, day, member.id)
            .map((event) => eventCalendarLabel(event, input))
            .join("\n\n"),
        );
        const chunks = texts.map((text) => printChunks(text, 18));
        for (
          let segment = 0;
          segment < Math.max(1, ...chunks.map((chunk) => chunk.length));
          segment++
        ) {
          const values = [
            safeSpreadsheetText(member.name + (segment ? " · Fortsetzung" : "")),
            ...chunks.map((chunk) => safeSpreadsheetText(chunk[segment] ?? "")),
          ];
          const row = grid.addRow(values);
          row.font = { size: 11 };
          row.alignment = { wrapText: true, vertical: "top" };
          const lines = Math.max(
            Math.ceil(values[0].length / 23),
            ...values
              .slice(1)
              .map((text) =>
                text
                  .split("\n")
                  .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 14)), 0),
              ),
          );
          row.height = Math.max(40, lines * 15 + 8);
          row.getCell(1).font = { size: 11, bold: true };
        }
      }
      grid.headerFooter.oddFooter = "&LDigitalMask · Teamplanung&C&P / &N";
    }
    const legend = workbook.addWorksheet("Kalenderlegende");
    legend.columns = [
      { header: "Kategorie", key: "name", width: 45 },
      { header: "Terminart", key: "type", width: 25 },
      { header: "Farbe", key: "color", width: 16 },
    ];
    for (const category of calendarLegend(input))
      legend.addRow({
        name: safeSpreadsheetText(category.categoryName),
        type: category.allDay ? "Ganztägig" : "Mit Uhrzeit",
        color: category.color,
      });
    legend.getRow(1).font = { bold: true };
  }
  sheet.headerFooter.oddFooter = "&LDigitalMask&C&P / &N";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
