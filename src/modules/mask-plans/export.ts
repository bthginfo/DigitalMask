import type { ExportInput } from "@/modules/exports/types";
import { csvCell, safeSpreadsheetText } from "@/modules/exports/spreadsheet";
import { maskPlanValue, maskPlanActorNames, maskPlanStaffNames, maskPlanClock } from "./model";
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

/** Four compact print copies per A4 sheet, with every overlap in its own column. */
export async function buildMaskPlanXlsx(input: ExportInput) {
  const { default: ExcelJS } = await import("exceljs");
  const { compactMaskPlanGrid } = await import("./compact-print");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DigitalMask";
  for (const [planIndex, item] of maskPlanExportData(input).entries()) {
    const { boundaries, columns } = compactMaskPlanGrid(item.plan);
    const count = Math.max(1, columns.length),
      totalColumns = count + 1;
    const laneWidth = 42 / count;
    const sheet = workbook.addWorksheet("Plan " + (planIndex + 1), {
      views: [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
      },
    });
    sheet.columns = [
      ...[6, ...Array(count).fill(laneWidth)],
      2,
      ...[6, ...Array(count).fill(laneWidth)],
    ].map((width) => ({ width }));
    const rowHeights = boundaries.slice(0, -1).map(() => (input.performanceTime ? 24 : 10));
    const appointments = columns.flatMap((column, index) =>
      column.blocks.map((block) => {
        const entry = item.blocks.find((candidate) => candidate.block.id === block.id)!;
        const text =
          [entry.actors.join(" / "), block.title].filter(Boolean).join(" · ") +
          "\n" +
          block.startMinutes +
          " bis " +
          (block.startMinutes + block.durationMinutes) +
          " · " +
          block.durationMinutes +
          " min";
        const first = boundaries.indexOf(block.startMinutes),
          last = boundaries.indexOf(block.startMinutes + block.durationMinutes);
        const lines = text
          .split("\n")
          .reduce(
            (sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(6, laneWidth * 1.5))),
            0,
          );
        const available = rowHeights.slice(first, last).reduce((sum, height) => sum + height, 0);
        const needed = lines * 9 + 4;
        if (needed > available)
          for (let row = first; row < last; row++)
            rowHeights[row] += (needed - available) / (last - first);
        return { block, index, text, first, last };
      }),
    );
    const headings = columns.map((column) => {
      const lane = item.lanes.find((candidate) => candidate.lane.id === column.lane.id)!;
      return lane.staff.length
        ? [item.lanes.length > 1 ? lane.label : "", lane.staff.join(" / ")]
            .filter(Boolean)
            .join(" · ")
        : lane.label;
    });
    const headerHeight = Math.max(
      18,
      ...headings.map((label) => Math.ceil(label.length / Math.max(6, laneWidth * 1.5)) * 9 + 6),
    );
    const rowsPerCopy = boundaries.length + 2;
    for (let copy = 0; copy < 4; copy++) {
      const top = 1 + Math.floor(copy / 2) * (rowsPerCopy + 2),
        left = 1 + (copy % 2) * (totalColumns + 1);
      sheet.mergeCells(top, left, top, left + totalColumns - 1);
      const title = sheet.getCell(top, left);
      title.value = safeSpreadsheetText(item.productionTitle + " · " + item.plan.title);
      title.font = { name: "Calibri", size: 9, bold: true };
      title.alignment = { wrapText: true, vertical: "middle" };
      sheet.getRow(top).height = Math.max(16, Math.ceil(String(title.value).length / 65) * 11);
      sheet.getRow(top + 1).height = headerHeight;
      sheet.getCell(top + 1, left).value = "ZEIT";
      headings.forEach((label, index) => {
        sheet.getCell(top + 1, left + index + 1).value = safeSpreadsheetText(label);
      });
      for (let index = 0; index < boundaries.length; index++) {
        const minute = boundaries[index],
          row = top + index + 2;
        sheet.getRow(row).height = minute === 0 ? 16 : rowHeights[index];
        sheet.getCell(row, left).value =
          minute === 0
            ? "0 · Beginn" + (input.performanceTime ? " · " + input.performanceTime : "")
            : input.performanceTime
              ? {
                  richText: [
                    { text: String(minute) + "\n" },
                    { text: maskPlanClock(minute, input.performanceTime), font: { bold: true } },
                  ],
                }
              : String(minute);
        if (minute === 0) sheet.mergeCells(row, left, row, left + totalColumns - 1);
      }
      for (let row = top + 1; row < top + rowsPerCopy; row++)
        for (let col = left; col < left + totalColumns; col++) {
          const cell = sheet.getCell(row, col);
          cell.font = {
            name: "Calibri",
            size: 8,
            bold: row === top + 1 || row === top + rowsPerCopy - 1,
            color: { argb: "FF233932" },
          };
          cell.alignment = { wrapText: true, vertical: "top" };
          cell.border = {
            left: { style: "hair", color: { argb: "FF83968C" } },
            right: { style: "hair", color: { argb: "FF83968C" } },
            bottom: { style: "hair", color: { argb: "FFB8C6BF" } },
          };
          if (row === top + 1 || row === top + rowsPerCopy - 1)
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: row === top + 1 ? "FFEDF1EF" : "FFF6D3CA" },
            };
        }
      for (const { block, index, text, first, last } of appointments) {
        const row = top + 2 + first,
          end = top + 1 + last,
          col = left + 1 + index;
        if (row < end) sheet.mergeCells(row, col, end, col);
        const cell = sheet.getCell(row, col);
        cell.value = safeSpreadsheetText(text);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              "FF" +
              maskPlanPaleColor(block.color || item.color)
                .slice(1)
                .toUpperCase(),
          },
        };
      }
      for (let row = top + 1; row < top + rowsPerCopy; row++)
        for (const [col, side] of [
          [left, "left"],
          [left + totalColumns - 1, "right"],
        ] as const) {
          const cell = sheet.getCell(row, col);
          cell.border = { ...cell.border, [side]: { style: "thin", color: { argb: "FF233932" } } };
        }
    }
    sheet.pageSetup.printArea =
      "A1:" + sheet.getColumn(totalColumns * 2 + 1).letter + (rowsPerCopy * 2 + 2);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
