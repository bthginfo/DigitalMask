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
import { exportTimeDayMarkers } from "./time";

/** Spreadsheet programs also interpret whitespace-prefixed formulas. */
export function safeSpreadsheetText(value: string): string {
  return /^[\s\uFEFF]*[=+@-]/u.test(value) ? `'${value}` : value;
}
export function csvCell(value: string): string {
  return `"${safeSpreadsheetText(value).replace(/"/g, '""')}"`;
}
export function printChunks(text: string, width: number): string[] {
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
  if (
    ["events", "calendar"].includes(input.kind) &&
    ["team", "team-month"].includes(input.view ?? "")
  ) {
    const { buildTeamCalendarXlsx } = await import("./team-calendar-xlsx");
    return buildTeamCalendarXlsx(input);
  }
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
  if (["time", "attendance"].includes(input.kind)) {
    const markers = exportTimeDayMarkers(input);
    if (markers.length) {
      const labels = workbook.addWorksheet("Kalenderkennzeichen", {
        views: [{ state: "frozen", ySplit: 3 }],
        pageSetup: {
          paperSize: 9,
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:3",
        },
      });
      labels.columns = [
        { key: "person", width: 30 },
        { key: "date", width: 16 },
        { key: "week", width: 20 },
        { key: "label", width: 30 },
        { key: "title", width: 45 },
      ];
      labels.mergeCells("A1:E1");
      labels.getCell("A1").value = "Kalenderkennzeichen · keine Zeitbuchungen oder Stunden";
      labels.getRow(1).font = { bold: true, size: 14 };
      labels.mergeCells("A2:E2");
      labels.getCell("A2").value =
        "ABF, Ruhetag und Abwesenheiten ergänzen den Nachweis. Die Stundensummen enthalten ausschließlich gebuchte Zeiten.";
      labels.getRow(2).height = 34;
      labels.getRow(2).alignment = { wrapText: true, vertical: "top" };
      labels.addRow(["Person", "Datum", "Kalenderwoche", "Kalenderkennzeichen", "Titel / Hinweis"]);
      labels.getRow(3).font = { bold: true };
      for (const marker of markers)
        labels.addRow(
          [marker.person, marker.date, marker.week, marker.label, marker.title].map(
            safeSpreadsheetText,
          ),
        );
      labels.eachRow((row, index) => {
        if (index > 2) row.alignment = { wrapText: true, vertical: "top" };
      });
      labels.headerFooter.oddFooter = "&LDigitalMask · Kalenderkennzeichen ohne Stunden&C&P / &N";
    }
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
  sheet.headerFooter.oddFooter = "&LDigitalMask&C&P / &N";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
