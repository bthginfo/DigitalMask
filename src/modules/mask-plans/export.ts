import type { ExportInput } from "@/modules/exports/types";
import { csvCell, safeSpreadsheetText, printChunks } from "@/modules/exports/spreadsheet";
import {
  maskPlanValue,
  maskPlanActorNames,
  maskPlanStaffNames,
  maskPlanClock,
  maskPlanWindow,
} from "./model";
import { maskPlanPaleColor } from "./layout";

export function maskPlanExportData(input: ExportInput) {
  return input.records.map((record) => {
    const plan = maskPlanValue(record.data);
    const production = input.references?.productions?.find((item) => item.id === plan.productionId);
    const actors = input.references?.actors || [];
    const lanes = plan.lanes.map((lane, index) => ({
      lane,
      label: lane.label || `Maske ${index + 1}`,
      staff: maskPlanStaffNames(lane, input.members),
    }));
    const blocks = [...plan.blocks]
      .sort(
        (a, b) =>
          a.startMinutes - b.startMinutes ||
          a.laneId.localeCompare(b.laneId) ||
          a.id.localeCompare(b.id),
      )
      .map((block, index) => ({
        block,
        number: index + 1,
        actors: maskPlanActorNames(block, actors),
        lane: lanes.find((item) => item.lane.id === block.laneId)!,
      }));
    return {
      record,
      plan,
      productionTitle: String(production?.data.title || "Produktion"),
      color: String(production?.data.color || "#377a68"),
      lanes,
      blocks,
    };
  });
}

export function maskPlanExportRows(input: ExportInput) {
  return maskPlanExportData(input).flatMap(({ plan, productionTitle, blocks }) =>
    blocks.map(({ block, number, actors, lane }) => [
      productionTitle,
      plan.title,
      number,
      lane.label,
      lane.staff.join(" / "),
      actors.join(" / "),
      block.startMinutes,
      block.startMinutes + block.durationMinutes,
      block.durationMinutes,
      maskPlanClock(block.startMinutes, input.performanceTime || ""),
      maskPlanClock(block.startMinutes + block.durationMinutes, input.performanceTime || ""),
      block.title,
      block.notes,
    ]),
  );
}
export const maskPlanColumns = [
  "Produktion",
  "Maskenplan",
  "Nr.",
  "Spalte",
  "Maskenpersonal",
  "Schauspieler",
  "Start relativ (min)",
  "Ende relativ (min)",
  "Dauer (min)",
  "Beginn Uhrzeit",
  "Ende Uhrzeit",
  "Tätigkeit",
  "Hinweise",
];

export function buildMaskPlanCsv(input: ExportInput) {
  const lines = [
    maskPlanColumns.map(csvCell).join(";"),
    ...maskPlanExportRows(input).map((row) =>
      row
        .map((cell) => (typeof cell === "number" ? String(cell) : csvCell(String(cell))))
        .join(";"),
    ),
  ];
  return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`);
}

/** Timetables remain readable across horizontal sheets and vertical print pages. */
export async function buildMaskPlanXlsx(input: ExportInput) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  workbook.title = "Maskenpläne";
  const plans = maskPlanExportData(input);
  for (let planIndex = 0; planIndex < plans.length; planIndex++) {
    const item = plans[planIndex];
    const { plan } = item;
    const { start, ticks } = maskPlanWindow(plan);
    const points = [
      ...new Set([
        ...ticks,
        ...plan.blocks.flatMap((block) => [
          block.startMinutes,
          block.startMinutes + block.durationMinutes,
        ]),
      ]),
    ].sort((a, b) => a - b);
    const groups = Math.max(1, Math.ceil(item.lanes.length / 4));
    for (let group = 0; group < groups; group++) {
      const lanes = item.lanes.slice(group * 4, (group + 1) * 4);
      const sheet = workbook.addWorksheet(
        `Plan ${planIndex + 1}${groups > 1 ? ` - ${group + 1}` : ""}`,
        {
          views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
          pageSetup: {
            paperSize: 9,
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            printTitlesRow: "1:4",
            printTitlesColumn: "A:A",
            margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
          },
        },
      );
      const columnCount = Math.max(2, lanes.length + 1);
      sheet.columns = Array.from({ length: columnCount }, (_, index) => ({
        width: index === 0 ? (input.performanceTime ? 18 : 12) : 30,
      }));
      for (const row of [1, 2, 3]) sheet.mergeCells(row, 1, row, columnCount);
      sheet.getCell(1, 1).value = safeSpreadsheetText(`${item.productionTitle} · ${plan.title}`);
      sheet.getCell(1, 1).font = {
        name: "Calibri",
        size: 17,
        bold: true,
        color: { argb: "FF173F39" },
      };
      sheet.getRow(1).height = 48;
      sheet.getCell(1, 1).alignment = { vertical: "middle", wrapText: true };
      sheet.getCell(2, 1).value = safeSpreadsheetText(
        `${input.organization} · ${input.department}${groups > 1 ? ` · Spalten ${group * 4 + 1}–${group * 4 + lanes.length}` : ""}`,
      );
      sheet.getRow(2).height = 28;
      sheet.getCell(3, 1).value =
        `Minuten vor Vorstellungsbeginn · ${start} bis 0${input.performanceTime ? ` · Beginn ${input.performanceTime}` : ""}`;
      sheet.getRow(3).height = 26;
      sheet.getCell(4, 1).value = "ZEIT";
      for (let index = 0; index < lanes.length; index++)
        sheet.getCell(4, index + 2).value = safeSpreadsheetText(
          [lanes[index].label, lanes[index].staff.join(" / ")].filter(Boolean).join("\n"),
        );
      const headerLines = Math.max(
        2,
        ...lanes.map(
          (lane) => Math.ceil((lane.label.length + lane.staff.join(" / ").length) / 28) + 1,
        ),
      );
      sheet.getRow(4).height = Math.min(110, headerLines * 14);
      sheet.getRow(4).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF377A68" } };
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      const rowByMinute = new Map(points.map((minute, index) => [minute, index + 5]));
      for (let index = 0; index < points.length; index++) {
        const minute = points[index],
          rowIndex = index + 5;
        const row = sheet.getRow(rowIndex);
        row.height =
          minute === 0 ? 30 : Math.max(4, ((points[index + 1] - minute) / plan.stepMinutes) * 28);
        row.getCell(1).value =
          minute === 0
            ? `0 · Beginn${input.performanceTime ? `\n${input.performanceTime}` : ""}`
            : `${minute}${input.performanceTime ? `\n${maskPlanClock(minute, input.performanceTime)}` : ""}`;
        for (let column = 1; column <= columnCount; column++) {
          const cell = row.getCell(column);
          cell.font = {
            name: "Calibri",
            size: 10,
            color: { argb: "FF233932" },
            bold: minute === 0,
          };
          cell.alignment = { vertical: "top", wrapText: true };
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFC9D5CF" } },
            right: { style: "hair", color: { argb: "FFC9D5CF" } },
          };
          if (minute === 0)
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6D3CA" } };
        }
        if (minute === 0) sheet.mergeCells(rowIndex, 1, rowIndex, columnCount);
      }
      for (let index = 0; index < lanes.length; index++) {
        const laneBlocks = item.blocks.filter(({ block }) => block.laneId === lanes[index].lane.id);
        const overlapping = new Set(
          laneBlocks
            .filter(({ block }) =>
              laneBlocks.some(
                ({ block: other }) =>
                  other.id !== block.id &&
                  block.startMinutes < other.startMinutes + other.durationMinutes &&
                  other.startMinutes < block.startMinutes + block.durationMinutes,
              ),
            )
            .map(({ block }) => block.id),
        );
        for (const appointment of laneBlocks) {
          const { block, actors, number } = appointment;
          const first = rowByMinute.get(block.startMinutes)!,
            last = rowByMinute.get(block.startMinutes + block.durationMinutes)! - 1;
          const label = safeSpreadsheetText(
            `${number} · ${[actors.join(" / "), block.title].filter(Boolean).join(" · ")}\n${block.startMinutes} → ${block.startMinutes + block.durationMinutes} · ${block.durationMinutes} min`,
          );
          if (!overlapping.has(block.id) && first < last)
            sheet.mergeCells(first, index + 2, last, index + 2);
          for (let rowIndex = first; rowIndex <= last; rowIndex++) {
            const cell = sheet.getCell(rowIndex, index + 2);
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: {
                argb: `FF${maskPlanPaleColor(block.color || item.color)
                  .slice(1)
                  .toUpperCase()}`,
              },
            };
            if (rowIndex === first || overlapping.has(block.id))
              cell.value = cell.value ? safeSpreadsheetText(`${cell.value}\n${label}`) : label;
          }
        }
      }
      sheet.pageSetup.printArea = `A1:${sheet.getColumn(columnCount).letter}${points.length + 4}`;
      sheet.headerFooter.oddFooter = "DigitalMask · Seite &P von &N";
    }
  }
  const list = workbook.addWorksheet("Ablauf", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 2,
      fitToHeight: 0,
      printTitlesRow: "1:1",
      printTitlesColumn: "A:C",
    },
  });
  list.columns = maskPlanColumns.map((header, index) => ({
    header,
    width: [24, 24, 7, 20, 30, 35, 15, 15, 12, 18, 18, 35, 50][index],
  }));
  list.getRow(1).font = { name: "Calibri", size: 11, bold: true };
  const rows = maskPlanExportRows(input);
  for (const values of rows) {
    const parts = values.map((value, index) =>
      typeof value === "string" ? printChunks(value, list.getColumn(index + 1).width!) : [value],
    );
    for (let segment = 0; segment < Math.max(...parts.map((part) => part.length)); segment++) {
      const cells = parts.map((part, index) => part[segment] ?? (index === 0 ? "Fortsetzung" : ""));
      const row = list.addRow(
        cells.map((value) => (typeof value === "string" ? safeSpreadsheetText(value) : value)),
      );
      row.alignment = { wrapText: true, vertical: "top" };
      row.font = { name: "Calibri", size: 11 };
      row.height = Math.min(
        409,
        Math.max(
          28,
          ...cells.map(
            (value, index) =>
              String(value)
                .split("\n")
                .reduce(
                  (sum, part) =>
                    sum +
                    Math.max(1, Math.ceil(part.length / (list.getColumn(index + 1).width! - 3))),
                  0,
                ) * 14,
          ),
        ),
      );
    }
  }
  list.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, list.rowCount), column: maskPlanColumns.length },
  };
  const notes = workbook.addWorksheet("Personal und Hinweise");
  notes.columns = [
    { header: "Produktion / Plan", width: 35 },
    { header: "Spalte", width: 25 },
    { header: "Personal / Hinweise", width: 80 },
  ];
  for (const item of plans) {
    if (item.plan.notes)
      for (const part of printChunks(item.plan.notes, 80))
        notes.addRow([
          safeSpreadsheetText(`${item.productionTitle} · ${item.plan.title}`),
          "Hinweise",
          safeSpreadsheetText(part),
        ]);
    for (const lane of item.lanes)
      for (const part of printChunks(lane.staff.join(" / "), 80))
        notes.addRow([
          safeSpreadsheetText(item.plan.title),
          safeSpreadsheetText(lane.label),
          safeSpreadsheetText(part),
        ]);
  }
  notes.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  };
  notes.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: "top" };
    row.font = { name: "Calibri", size: 11 };
    row.height = Math.max(
      28,
      ...[1, 2, 3].map(
        (column) =>
          String(row.getCell(column).value || "")
            .split("\n")
            .reduce(
              (sum, part) =>
                sum + Math.max(1, Math.ceil(part.length / (notes.getColumn(column).width! - 4))),
              0,
            ) * 14,
      ),
    );
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
