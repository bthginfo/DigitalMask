import { format, getDay, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import type { Cell, Fill, Workbook, Worksheet } from "exceljs";
import { bavarianHoliday } from "@/shared/bavarian-holidays";
import { calendarPrintDayBackground } from "./team-calendar-print";
import { officePrintFont, officePrintLines } from "./office-print-text";
import { safeSpreadsheetText } from "./spreadsheet";
import { teamMonthPrintLayouts, teamMonthPrintMetrics } from "./team-month-print-layout";
import type { ExportInput } from "./types";

export const teamMonthExcelPrintMetrics = {
  ...teamMonthPrintMetrics,
  nameWidth: 60,
  margin: 14.25,
  lineHeight: 12,
  titleHeight: 0,
  headingHeight: 12,
  padding: 0.75,
  horizontalPadding: 1.5,
  columnQuantum: 0.75,
  border: 0,
  entryGap: 0,
};
const metrics = teamMonthExcelPrintMetrics;
const fill = (color: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${color.replace("#", "").toUpperCase()}` },
});
const font = (color = "#172a22", bold = false) => ({
  name: officePrintFont,
  size: metrics.fontSize,
  color: { argb: `FF${color.replace("#", "").toUpperCase()}` },
  bold,
});
// OpenXML width already includes cell padding; Excel's default Calibri-11 unit is seven pixels.
// Round down to whole pixels so measurement and native Excel widths agree at 100% scale.
const columnWidth = (points: number) => Math.floor(points / 0.75) / 7;

function borders(cell: Cell, bottom = false) {
  cell.border = {
    left: { style: "hair", color: { argb: "FFB4C0B8" } },
    right: { style: "hair", color: { argb: "FFB4C0B8" } },
    ...(bottom ? { bottom: { style: "thin" as const, color: { argb: "FF83968C" } } } : {}),
  };
}

function writeMonthPage(
  workbook: Workbook,
  layout: ReturnType<typeof teamMonthPrintLayouts>[number],
) {
  const { block, rows, dayWidth } = layout;
  const firstDay = Number(block.days[0].slice(-2));
  const lastDay = Number(block.days.at(-1)!.slice(-2));
  const sheet = workbook.addWorksheet(`Team ${block.key.slice(0, 7)} ${firstDay}-${lastDay}`, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      scale: 100,
      fitToPage: false,
      blackAndWhite: false,
      horizontalCentered: true,
      margins: {
        left: metrics.margin / 72,
        right: metrics.margin / 72,
        top: metrics.margin / 72,
        bottom: metrics.margin / 72,
        header: 0,
        footer: 0,
      },
    },
  });
  sheet.columns = [
    { width: columnWidth(metrics.nameWidth) },
    ...block.days.map(() => ({ width: columnWidth(dayWidth) })),
  ];
  const lastColumn = block.days.length + 1;
  // The month/year lives in the matrix corner; no extra printed report heading.
  sheet.getRow(1).hidden = true;
  sheet.getRow(1).height = 0.75;
  const heading = sheet.getRow(2);
  heading.values = [
    format(parseISO(block.days[0]), "MM/yyyy"),
    ...block.days.map((day) => format(parseISO(day), "EEE dd.MM.", { locale: de })),
  ];
  heading.height = metrics.headingHeight;
  heading.eachCell((cell, index) => {
    const day = block.days[index - 2];
    cell.font = font(undefined, true);
    cell.fill = fill(day && [0, 6].includes(getDay(parseISO(day))) ? "#e2e8e3" : "#edf1ef");
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    borders(cell, true);
    const holiday = day && bavarianHoliday(day);
    if (holiday) cell.note = holiday;
  });
  let rowIndex = 3;
  for (const row of rows)
    rowIndex = writePerson(
      sheet,
      { ...row, height: Math.floor(row.height / 0.75) * 0.75 },
      rowIndex,
    );
  sheet.pageSetup.printArea = `A2:${sheet.getColumn(lastColumn).letter}${rowIndex - 1}`;
  return sheet;
}

/** Merge each appointment across shared row bands; no continuation list or cut-off person. */
function writePerson(
  sheet: Worksheet,
  person: ReturnType<typeof teamMonthPrintLayouts>[number]["rows"][number],
  firstRow: number,
) {
  const starts = person.cells.map((entries) => {
    let offset = 0;
    return entries.map((entry) => {
      const start = offset;
      offset += entry.height;
      return { entry, start, end: offset };
    });
  });
  const positions = new Set([0, person.height]);
  for (const entries of starts)
    for (const entry of entries) {
      positions.add(entry.start);
      positions.add(entry.end);
    }
  // Empty areas may be tall, while an Excel row has a 409-point height limit.
  for (let offset = 120; offset < person.height; offset += 120) positions.add(offset);
  const boundaries = [...positions].sort((a, b) => a - b);
  const rowCount = boundaries.length - 1;
  for (let index = 0; index < rowCount; index++) {
    const row = sheet.getRow(firstRow + index);
    row.height = boundaries[index + 1] - boundaries[index];
    for (let column = 1; column <= person.cells.length + 1; column++) {
      const cell = row.getCell(column);
      cell.value = "";
      cell.font = font();
      cell.fill = fill(
        column === 1 ? "#ffffff" : calendarPrintDayBackground(person.cells[column - 2]),
      );
      borders(cell, index === rowCount - 1);
    }
  }
  if (rowCount > 1) sheet.mergeCells(firstRow, 1, firstRow + rowCount - 1, 1);
  const name = sheet.getCell(firstRow, 1);
  name.value = safeSpreadsheetText(person.nameLines.join("\n"));
  name.font = font(undefined, true);
  name.alignment = { wrapText: true, vertical: "middle" };
  for (let day = 0; day < starts.length; day++) {
    for (const { entry, start, end } of starts[day]) {
      const top = firstRow + boundaries.indexOf(start);
      const bottom = firstRow + boundaries.indexOf(end) - 1;
      if (bottom > top) sheet.mergeCells(top, day + 2, bottom, day + 2);
      const cell = sheet.getCell(top, day + 2);
      cell.value = safeSpreadsheetText(entry.lines.join("\n"));
      cell.font = font(entry.textColor);
      cell.fill = fill(entry.color);
      cell.alignment = { wrapText: true, vertical: "top" };
    }
  }
  return firstRow + rowCount;
}

/** Two separately printable, editable A4 landscape sheets per complete month. */
export async function buildTeamMonthCalendarXlsx(input: ExportInput) {
  const layouts = teamMonthPrintLayouts(input, officePrintLines, metrics);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  for (const layout of layouts) writeMonthPage(workbook, layout);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
