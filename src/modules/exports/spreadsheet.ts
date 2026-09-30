import { formatInTimeZone } from "date-fns-tz";
import { cellText, columnsFor, durationSeconds, exportRows, titles } from "./data";
import type { ExportInput } from "./types";

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
  return Array.from({ length: Math.max(1, Math.ceil(lines.length / 18)) }, (_, i) =>
    lines.slice(i * 18, i * 18 + 18).join("\n"),
  );
}
export function buildCsv(input: ExportInput): Uint8Array {
  const columns = columnsFor(input.kind);
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
  workbook.title = titles[input.kind] ?? "Datenexport";
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
  const columns = columnsFor(input.kind),
    rows = exportRows(input);
  const excelRows = rows.flatMap((row) => {
    const cells = columns.map((col) => {
      const value = row.values[col.key];
      return typeof value === "string" ? printChunks(value, col.width) : [value];
    });
    return Array.from({ length: Math.max(...cells.map((c) => c.length)) }, (_, segment) =>
      columns.map((col, index) => {
        const value = cells[index][segment] ?? (index === 0 ? "Fortsetzung" : "");
        if (value instanceof Date)
          return new Date(`${formatInTimeZone(value, "Europe/Berlin", "yyyy-MM-dd'T'HH:mm:ss")}Z`);
        return typeof value === "string" ? safeSpreadsheetText(value) : value;
      }),
    );
  });
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  // Very wide structured look sheets span horizontal pages at a readable scale.
  sheet.pageSetup.fitToWidth = Math.max(
    1,
    Math.ceil(columns.reduce((sum, col) => sum + col.width, 0) / 135),
  );
  if (input.kind === "looks") sheet.pageSetup.printTitlesColumn = "A:B";
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = `${titles[input.kind] ?? input.kind} · ${input.department}`;
  sheet.getRow(1).height = 29;
  sheet.getCell(1, 1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF173F39" } };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = safeSpreadsheetText(
    `${input.organization} · ${input.from ?? "Gesamter Zeitraum"}${input.to ? ` – ${input.to}` : ""}`,
  );
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
          input.kind === "events" || input.kind === "calendar" ? "dd.mm.yyyy hh:mm" : "dd.mm.yyyy";
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
  sheet.headerFooter.oddFooter = "&LDigitalMask&C&P / &N";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
