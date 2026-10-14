import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { calendarRange } from "./calendar";
import { teamCalendarMembers } from "./team-calendar";
import { teamPrintEntries } from "./team-calendar-print";
import type { ExportInput } from "./types";

export const teamMonthPrintMetrics = {
  pageWidth: 841.89,
  pageHeight: 595.28,
  margin: 18,
  nameWidth: 84,
  fontSize: 10,
  lineHeight: 10.8,
  titleHeight: 16,
  headingHeight: 24,
  padding: 1,
  horizontalPadding: 1,
  columnQuantum: 0,
  rowQuantum: 0,
  textSafety: 0.25,
  border: 0.5,
  entryGap: 0.4,
  minRowHeight: 24,
} as const;
export type PrintWrapLines = (
  text: string,
  width: number,
  size: number,
  weight: number,
) => string[];
export type TeamMonthPrintMetrics = { [K in keyof typeof teamMonthPrintMetrics]: number };

export function teamMonthPrintBlocks(input: ExportInput) {
  const range = calendarRange(input);
  const blocks: { key: string; title: string; days: string[] }[] = [];
  for (
    let month = startOfMonth(parseISO(range.from));
    month <= parseISO(range.to);
    month = addMonths(month, 1)
  ) {
    const days = Array.from({ length: endOfMonth(month).getDate() }, (_, index) =>
      format(addDays(month, index), "yyyy-MM-dd"),
    );
    for (const [index, part] of [days.slice(0, 14), days.slice(14)].entries()) {
      blocks.push({
        key: `${format(month, "yyyy-MM")}-${index + 1}`,
        title: `${format(month, "MMMM yyyy", { locale: de })} · ${index ? 15 : 1}.–${index ? days.length : 14}.`,
        days: part,
      });
    }
  }
  return blocks;
}

/** Two complete pages per month: tighten spacing before reducing the uniform font size. */
export function teamMonthPrintLayouts(
  input: ExportInput,
  wrapLines: PrintWrapLines,
  metrics: TeamMonthPrintMetrics = teamMonthPrintMetrics,
) {
  const members = teamCalendarMembers(input);
  // Resolve/filter entries once; font fitting only reflows in-memory text.
  const source = teamMonthPrintBlocks(input).map((block) => ({
    block,
    rows: members.map((member) => ({
      member,
      cells: block.days.map((day) => teamPrintEntries(input, day, member.id)),
    })),
  }));
  const calculate = (m: TeamMonthPrintMetrics) => {
    const width = m.pageWidth - 2 * m.margin;
    const availableHeight =
      m.pageHeight - 2 * m.margin - m.titleHeight - m.headingHeight - 2 * m.border - 1;
    const roundUp = (height: number) =>
      m.rowQuantum ? Math.ceil((height - 1e-8) / m.rowQuantum) * m.rowQuantum : height;
    return source.map(({ block, rows: records }) => {
      const rawDayWidth = (width - m.nameWidth) / block.days.length;
      const dayWidth = m.columnQuantum
        ? Math.floor(rawDayWidth / m.columnQuantum) * m.columnQuantum
        : rawDayWidth;
      const rows = records.map(({ member, cells: entries }) => {
        const nameLines = wrapLines(
          member.name,
          m.nameWidth - 2 * m.horizontalPadding - 1,
          m.fontSize,
          700,
        );
        const cells = entries.map((day) =>
          day.map((entry) => {
            const textWidth = dayWidth - 2 * m.horizontalPadding - 1;
            const inline = wrapLines(
              [entry.time, entry.title].filter(Boolean).join(" · "),
              textWidth,
              m.fontSize,
              400,
            );
            const stacked = [entry.time, entry.title]
              .filter(Boolean)
              .flatMap((text) => wrapLines(text, textWidth, m.fontSize, 400));
            const lines = inline.length <= stacked.length ? inline : stacked;
            return {
              ...entry,
              lines,
              height: roundUp(lines.length * m.lineHeight + 2 * m.padding + m.textSafety),
            };
          }),
        );
        const height = roundUp(
          Math.max(
            m.minRowHeight,
            nameLines.length * m.lineHeight + 2 * m.padding + m.textSafety,
            ...cells.map(
              (day) =>
                day.reduce((sum, entry) => sum + entry.height, 0) +
                Math.max(0, day.length - 1) * m.entryGap,
            ),
          ) + m.border,
        );
        return { member, nameLines, cells, height };
      });
      const requiredHeight = rows.reduce((sum, row) => sum + row.height, 0);
      const extra = rows.length ? Math.max(0, availableHeight - requiredHeight) / rows.length : 0;
      return {
        block,
        metrics: m,
        dayWidth,
        width: m.nameWidth + dayWidth * block.days.length,
        requiredHeight,
        availableHeight,
        requiresPrintScaling: requiredHeight > availableHeight,
        rows: rows.map((row) => ({ ...row, height: row.height + extra })),
      };
    });
  };
  const fits = (layouts: ReturnType<typeof calculate>) =>
    layouts.every((layout) => !layout.requiresPrintScaling);
  const regular = calculate(metrics);
  if (fits(regular)) return regular;

  const compact = {
    ...metrics,
    margin: Math.min(metrics.margin, 14.25),
    titleHeight: Math.min(metrics.titleHeight, 12),
    // Native Excel's cell insets are fixed; preserve them in the width/height measurement.
    padding: input.format === "xlsx" ? metrics.padding : Math.min(metrics.padding, 0.25),
    horizontalPadding:
      input.format === "xlsx" ? metrics.horizontalPadding : Math.min(metrics.horizontalPadding, 1),
    entryGap: 0,
  };
  const atSize = (fontSize: number) => {
    const ratio = fontSize / metrics.fontSize;
    return calculate({
      ...compact,
      fontSize,
      lineHeight: metrics.lineHeight * ratio,
      padding: input.format === "xlsx" ? compact.padding : compact.padding * ratio,
      horizontalPadding:
        input.format === "xlsx" ? compact.horizontalPadding : compact.horizontalPadding * ratio,
      titleHeight: compact.titleHeight * ratio,
      headingHeight:
        input.format === "xlsx" ? compact.headingHeight : compact.headingHeight * ratio,
      minRowHeight: metrics.minRowHeight * ratio,
      border: metrics.border * ratio,
      textSafety: input.format === "xlsx" ? compact.textSafety : compact.textSafety * ratio,
    });
  };
  const tightened = atSize(metrics.fontSize);
  if (fits(tightened)) return tightened;

  // Quarter-point search keeps both halves consistent and picks the largest fitting font.
  let lower = 4;
  let upper = Math.floor(metrics.fontSize * 4) - 1;
  let result = atSize(1);
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = atSize(middle / 4);
    if (fits(candidate)) {
      result = candidate;
      lower = middle + 1;
    } else upper = middle - 1;
  }
  // Native Excel supports fonts from one point; extremely dense sheets use its
  // whole-sheet print fitting. PDF can reflow smaller without discarding content.
  if (input.format !== "xlsx") for (let size = 0.5; !fits(result); size /= 2) result = atSize(size);
  return result;
}
