import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import type { Workbook, Worksheet } from "exceljs";
import { calendarRange } from "./calendar";
import { teamCalendarMembers, teamCalendarWeeks } from "./team-calendar";
import { teamPrintEntries } from "./team-calendar-print";
import { printChunks, safeSpreadsheetText } from "./spreadsheet";
import type { ExportInput } from "./types";

function calendarBlock(sheet: Worksheet, input: ExportInput, days: string[], startRow: number) {
  const compact = days.length > 7;
  const size = compact ? 10 : 11;
  const capacity = compact ? 10 : 21;
  const lastColumn = days.length + 1;
  const heading = sheet.getRow(startRow);
  heading.values = [
    "Person",
    ...days.map((day) => format(parseISO(day), "EEE dd.MM.", { locale: de })),
  ];
  heading.height = 22;
  heading.font = {
    name: "Calibri",
    size: compact ? 9 : 10,
    bold: true,
    color: { argb: "FF233932" },
  };
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF1EF" } };
  heading.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  let rowIndex = startRow + 1;
  for (const member of teamCalendarMembers(input)) {
    const cells = days.map((day) =>
      teamPrintEntries(input, day, member.id).flatMap((entry) =>
        printChunks([entry.time, entry.title].filter(Boolean).join("\n"), capacity + 4).flatMap(
          (text) => {
            const lines = text.split("\n");
            return Array.from({ length: Math.ceil(lines.length / 12) }, (_, index) => ({
              text: lines.slice(index * 12, (index + 1) * 12).join("\n"),
              color: entry.color,
              textColor: entry.textColor,
            }));
          },
        ),
      ),
    );
    const slots = Math.max(1, ...cells.map((cell) => cell.length));
    const firstRow = rowIndex;
    for (let slot = 0; slot < slots; slot++, rowIndex++) {
      const row = sheet.getRow(rowIndex);
      row.font = { name: "Calibri", size };
      row.alignment = { wrapText: true, vertical: "top" };
      let lines = 1;
      for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
        const entry = cells[dayIndex][slot];
        const cell = row.getCell(dayIndex + 2);
        cell.value = entry ? safeSpreadsheetText(entry.text) : "";
        cell.border = { right: { style: "hair", color: { argb: "FFB8C6BF" } } };
        if (entry) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF" + entry.color.slice(1).toUpperCase() },
          };
          cell.font = {
            name: "Calibri",
            size,
            color: { argb: "FF" + entry.textColor.slice(1).toUpperCase() },
          };
          lines = Math.max(
            lines,
            entry.text
              .split("\n")
              .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / capacity)), 0),
          );
        }
      }
      if (slots === 1) lines = Math.max(lines, Math.ceil(member.name.length / 20));
      row.height = Math.min(400, Math.max(22, lines * (size + 3) + 5));
    }
    if (rowIndex - firstRow > 1) sheet.mergeCells(firstRow, 1, rowIndex - 1, 1);
    const nameCell = sheet.getCell(firstRow, 1);
    nameCell.value = safeSpreadsheetText(member.name);
    nameCell.font = { name: "Calibri", size, bold: true, color: { argb: "FF233932" } };
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7F5" } };
    nameCell.alignment = { wrapText: true, vertical: "middle" };
    for (let col = 1; col <= lastColumn; col++)
      sheet.getCell(rowIndex - 1, col).border = {
        ...sheet.getCell(rowIndex - 1, col).border,
        bottom: { style: "thin", color: { argb: "FF83968C" } },
      };
  }
  return rowIndex;
}

function matrixSheet(workbook: Workbook, name: string, title: string, days: number) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 1, ySplit: days > 7 ? 1 : 2, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
    },
  });
  sheet.columns = [
    { width: 20 },
    ...Array.from({ length: days }, () => ({ width: days > 7 ? 9.5 : 21 })),
  ];
  sheet.mergeCells(1, 1, 1, days + 1);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF233932" } };
  sheet.getRow(1).height = 24;
  return sheet;
}

/** Month halves mirror the familiar theatre schedule, with one coloured cell per entry. */
export async function buildTeamCalendarXlsx(input: ExportInput) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  if (input.view === "team-month") {
    const range = calendarRange(input);
    for (
      let month = startOfMonth(parseISO(range.from));
      month <= parseISO(range.to);
      month = addMonths(month, 1)
    ) {
      const count = endOfMonth(month).getDate();
      const days = Array.from({ length: count }, (_, index) =>
        format(addDays(month, index), "yyyy-MM-dd"),
      );
      const sheet = matrixSheet(
        workbook,
        `Team ${format(month, "MM-yyyy")}`,
        format(month, "MMMM yyyy", { locale: de }),
        16,
      );
      const nextRow = calendarBlock(sheet, input, days.slice(0, 16), 2);
      sheet.getRow(nextRow).height = 12;
      const endRow = calendarBlock(sheet, input, days.slice(16), nextRow + 1);
      sheet.pageSetup.printArea = `A1:Q${endRow - 1}`;
      const height = Array.from(
        { length: endRow - 1 },
        (_, index) => sheet.getRow(index + 1).height || 22,
      ).reduce((sum, value) => sum + value, 0);
      if (height <= 600) sheet.pageSetup.fitToHeight = 1;
      else sheet.getRow(nextRow).addPageBreak();
    }
  } else {
    for (const week of teamCalendarWeeks(input)) {
      const sheet = matrixSheet(
        workbook,
        `Team ${week.key}`,
        `KW ${format(parseISO(week.key), "II")}`,
        7,
      );
      const endRow = calendarBlock(sheet, input, week.days, 2);
      sheet.pageSetup.printArea = `A1:H${endRow - 1}`;
      sheet.pageSetup.fitToHeight = 1;
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
