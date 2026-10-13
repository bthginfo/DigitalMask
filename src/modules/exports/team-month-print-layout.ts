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

export class CalendarPrintFitError extends Error {
  constructor(
    public requiredHeight = 0,
    public availableHeight = 0,
  ) {
    super(
      "Der Teammonat enthält zu viel Text für zwei lesbare A4-Seiten mit 10-Punkt-Schrift. Bitte kürze lange Termintitel oder nutze für diesen Monat die Teamwochen-Druckansicht. Es wurden keine Einträge abgeschnitten.",
    );
    this.name = "CalendarPrintFitError";
  }
}

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

/** Two complete pages per month, with fixed physical typography and indivisible person rows. */
export function teamMonthPrintLayouts(input: ExportInput, wrapLines: PrintWrapLines) {
  const m = teamMonthPrintMetrics;
  const width = m.pageWidth - 2 * m.margin;
  const availableHeight =
    m.pageHeight - 2 * m.margin - m.titleHeight - m.headingHeight - 2 * m.border - 1;
  const members = teamCalendarMembers(input);
  const layouts = teamMonthPrintBlocks(input).map((block) => {
    const dayWidth = (width - m.nameWidth) / block.days.length;
    const rows = members.map((member) => {
      const nameLines = wrapLines(member.name, m.nameWidth - 2 * m.padding - 1, m.fontSize, 700);
      const cells = block.days.map((day) =>
        teamPrintEntries(input, day, member.id).map((entry) => {
          const lines = [entry.time, entry.title]
            .filter(Boolean)
            .flatMap((text) => wrapLines(text, dayWidth - 2 * m.padding - 1, m.fontSize, 400));
          return { ...entry, lines, height: lines.length * m.lineHeight + 2 * m.padding };
        }),
      );
      const height =
        Math.max(
          m.minRowHeight,
          nameLines.length * m.lineHeight + 2 * m.padding,
          ...cells.map(
            (entries) =>
              entries.reduce((sum, entry) => sum + entry.height, 0) +
              Math.max(0, entries.length - 1) * m.entryGap,
          ),
        ) + m.border;
      return { member, nameLines, cells, height };
    });
    const requiredHeight = rows.reduce((sum, row) => sum + row.height, 0);
    // Use the hanging plan's full sheet height without scaling the font or hiding entries.
    const extra = rows.length ? Math.max(0, availableHeight - requiredHeight) / rows.length : 0;
    return {
      block,
      dayWidth,
      width,
      requiredHeight,
      rows: rows.map((row) => ({ ...row, height: row.height + extra })),
    };
  });
  const requiredHeight = Math.max(0, ...layouts.map((layout) => layout.requiredHeight));
  if (requiredHeight > availableHeight)
    throw new CalendarPrintFitError(requiredHeight, availableHeight);
  return layouts;
}
