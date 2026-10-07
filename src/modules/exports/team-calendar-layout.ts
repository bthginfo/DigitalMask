import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { calendarRange } from "./calendar";
import { teamCalendarMembers, teamCalendarWeeks } from "./team-calendar";
import { teamPrintEntries } from "./team-calendar-print";
import type { ExportInput } from "./types";

/** Dimensions taken from the team's October 2026 Excel print template. */
export const teamCalendarPrintStyle = {
  nameWidth: 20,
  dayWidth: 21,
  monthDayWidth: 9.5,
  rowHeight: 35,
  titleHeight: 24,
  headingHeight: 22,
  nameFontSize: 12,
  titleFontSize: 14,
  headingFontSize: 10,
  fontSize: 11,
  monthFontSize: 9,
  scale: 74,
  margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
} as const;

export function teamCalendarBlocks(input: ExportInput) {
  if (input.view !== "team-month")
    return teamCalendarWeeks(input).map((week) => ({
      key: week.key,
      title: `KW ${format(parseISO(week.key), "II")}`,
      days: week.days,
    }));
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
    for (const [index, half] of [days.slice(0, 16), days.slice(16)].entries())
      blocks.push({
        key: `${format(month, "yyyy-MM")}-${index + 1}`,
        title: `${format(month, "MMMM yyyy", { locale: de })} · ${index ? "17" : "1"}–${index ? days.length : 16}`,
        days: [...half, ...Array(16 - half.length).fill("")],
      });
  }
  return blocks;
}

export type CalendarPrintCell = ReturnType<typeof teamPrintEntries>[number] & { text: string };

/** Keep uniform line heights, continuing long entries rather than hiding text. */
export function calendarCellLines(text: string, capacity: number) {
  const lines: string[] = [];
  for (let line of text.replace(/\r\n?/g, "\n").split("\n")) {
    while (line.length > capacity) {
      const space = line.lastIndexOf(" ", capacity);
      const cut = space > capacity / 2 ? space : capacity;
      lines.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  return lines;
}

export function teamCalendarRows(
  input: ExportInput,
  days: string[],
  measureLines?: (text: string) => string[],
) {
  const compact = days.length > 7;
  const linesPerSlot = compact ? 3 : 2;
  return teamCalendarMembers(input).map((member) => {
    const cells = days.map((day) =>
      teamPrintEntries(input, day, member.id).flatMap((entry) => {
        const text = [entry.time, entry.title].filter(Boolean).join("\n");
        const lines = measureLines
          ? text.split("\n").flatMap(measureLines)
          : calendarCellLines(text, compact ? 12 : 24);
        return Array.from(
          { length: Math.ceil(lines.length / linesPerSlot) },
          (_, index): CalendarPrintCell => ({
            ...entry,
            text: lines.slice(index * linesPerSlot, (index + 1) * linesPerSlot).join("\n"),
          }),
        );
      }),
    );
    return {
      member,
      cells,
      slots: Math.max(
        2,
        Math.ceil(
          (calendarCellLines(member.name, 17).length * 15) / teamCalendarPrintStyle.rowHeight,
        ),
        ...cells.map((cell) => cell.length),
      ),
    };
  });
}
