import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import type { Workbook, Worksheet } from "exceljs";
import {
  teamCalendarBlocks,
  teamCalendarRows,
  teamCalendarPrintStyle as metrics,
} from "./team-calendar-layout";
import { safeSpreadsheetText } from "./spreadsheet";
import type { ExportInput } from "./types";
import { bavarianHoliday } from "@/shared/bavarian-holidays";

function calendarBlock(sheet: Worksheet, input: ExportInput, days: string[], startRow: number) {
  const compact = days.length > 7;
  const size = compact ? metrics.monthFontSize : metrics.fontSize;
  const lastColumn = days.length + 1;
  const heading = sheet.getRow(startRow);
  heading.values = [
    "Person",
    ...days.map((day) =>
      day ? format(parseISO(day), compact ? "EEEdd.MM." : "EEE dd.MM.", { locale: de }) : "",
    ),
  ];
  heading.height = metrics.headingHeight;
  heading.font = {
    name: "Calibri",
    size: metrics.headingFontSize,
    bold: true,
    color: { argb: "FF233932" },
  };
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF1EF" } };
  heading.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  days.forEach((day, index) => {
    const holiday = bavarianHoliday(day);
    if (holiday) heading.getCell(index + 2).note = holiday;
  });
  let rowIndex = startRow + 1;
  for (const { member, cells, slots } of teamCalendarRows(input, days)) {
    const firstRow = rowIndex;
    for (let slot = 0; slot < slots; slot++, rowIndex++) {
      const row = sheet.getRow(rowIndex);
      row.height = metrics.rowHeight;
      row.font = { name: "Calibri", size };
      row.alignment = { wrapText: true, vertical: "top" };
      for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
        const entry = cells[dayIndex][slot],
          cell = row.getCell(dayIndex + 2);
        cell.value = entry ? safeSpreadsheetText(entry.text) : "";
        cell.border = { right: { style: "hair", color: { argb: "FFB8C6BF" } } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: entry ? `FF${entry.color.slice(1).toUpperCase()}` : "FFFFFFFF" },
        };
        cell.font = {
          name: "Calibri",
          size,
          color: { argb: entry ? `FF${entry.textColor.slice(1).toUpperCase()}` : "FF000000" },
        };
      }
    }
    sheet.mergeCells(firstRow, 1, rowIndex - 1, 1);
    const nameCell = sheet.getCell(firstRow, 1);
    nameCell.value = safeSpreadsheetText(member.name);
    nameCell.font = {
      name: "Calibri",
      size: metrics.nameFontSize,
      bold: true,
      color: { argb: "FF233932" },
    };
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    nameCell.alignment = { horizontal: "left", wrapText: true, vertical: "middle" };
    for (let col = 1; col <= lastColumn; col++)
      sheet.getCell(rowIndex - 1, col).border = {
        ...sheet.getCell(rowIndex - 1, col).border,
        bottom: { style: "thin", color: { argb: "FF83968C" } },
      };
  }
  for (let row = startRow; row < rowIndex; row++) {
    for (const [column, side] of [
      [1, "left"],
      [lastColumn, "right"],
    ] as const) {
      const cell = sheet.getCell(row, column);
      cell.border = { ...cell.border, [side]: { style: "medium", color: { argb: "FF000000" } } };
    }
  }
  for (let col = 1; col <= lastColumn; col++) {
    const top = sheet.getCell(startRow, col),
      bottom = sheet.getCell(rowIndex - 1, col);
    top.border = { ...top.border, top: { style: "medium", color: { argb: "FF000000" } } };
    bottom.border = { ...bottom.border, bottom: { style: "medium", color: { argb: "FF000000" } } };
  }
  return rowIndex;
}

function matrixSheet(workbook: Workbook, name: string, days: number) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      scale: metrics.scale,
      fitToPage: false,
      margins: { ...metrics.margins },
    },
  });
  sheet.columns = [
    { width: metrics.nameWidth },
    ...Array.from({ length: days }, () => ({
      width: days > 7 ? metrics.monthDayWidth : metrics.dayWidth,
    })),
  ];
  return sheet;
}

/** Match the department's fixed-height, full-colour Excel print template. */
export async function buildTeamCalendarXlsx(input: ExportInput) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  const blocks = teamCalendarBlocks(input);
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const monthly = input.view === "team-month";
    const sheet = matrixSheet(
      workbook,
      monthly ? `Team ${block.key.slice(0, 7)}` : `Team ${block.key}`,
      monthly ? 16 : 7,
    );
    const write = (part: typeof block, row: number) => {
      sheet.mergeCells(row, 1, row, monthly ? 17 : 8);
      const title = sheet.getCell(row, 1);
      title.value = safeSpreadsheetText(part.title);
      title.font = {
        name: "Calibri",
        size: metrics.titleFontSize,
        bold: true,
        color: { argb: "FF233932" },
      };
      title.alignment = { vertical: "middle", wrapText: true };
      title.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
      sheet.getRow(row).height = metrics.titleHeight;
      return calendarBlock(sheet, input, part.days, row + 1);
    };
    let endRow = write(block, 1);
    if (monthly && blocks[index + 1]?.key.slice(0, 7) === block.key.slice(0, 7)) {
      sheet.getRow(endRow - 1).addPageBreak();
      endRow = write(blocks[++index], endRow);
    }
    sheet.pageSetup.printArea = `A1:${monthly ? "Q" : "H"}${endRow - 1}`;
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
