import React from "react";
import { Page as PdfPage, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { calendarRange } from "./calendar";
import { calendarLegend, teamCalendarMembers, teamCalendarWeeks } from "./team-calendar";
import { teamPrintEntries } from "./team-calendar-print";
import type { ExportInput } from "./types";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  landscape?: boolean;
  children: React.ReactNode;
  label?: string;
}>;
type WrapLines = (text: string, width: number, size: number, weight: number) => string[];
const pageWidth = 841.89;
const availableHeight = 535;
const nameWidth = 99;
const dayWidth = (pageWidth - 36 - nameWidth) / 7;
const styles = StyleSheet.create({
  page: { padding: 18, paddingBottom: 42, fontFamily: "Noto", color: "#233932" },
  week: { marginBottom: 14 },
  title: { fontSize: 12, fontWeight: 700, marginBottom: 5 },
  head: { flexDirection: "row", backgroundColor: "#edf1ef", minHeight: 20 },
  heading: { padding: 4, fontSize: 8.5, fontWeight: 700 },
  row: { flexDirection: "row" },
  name: { width: nameWidth, padding: 4, fontWeight: 700, backgroundColor: "#f5f7f5" },
  cell: {
    width: dayWidth,
    padding: 2,
    borderBottomWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "#b8c6bf",
  },
  entry: { padding: 3, marginBottom: 2, borderRadius: 1 },
});

function weekLayout(
  input: ExportInput,
  week: ReturnType<typeof teamCalendarWeeks>[number],
  size: number,
  wrapLines: WrapLines,
) {
  const lineHeight = size * 1.25;
  const rows = teamCalendarMembers(input).map((member) => {
    const name = wrapLines(member.name, nameWidth - 8, size, 700);
    const cells = week.days.map((day) => ({
      day,
      entries: teamPrintEntries(input, day, member.id).map((entry) => ({
        ...entry,
        lines: [
          ...(entry.time ? wrapLines(entry.time, dayWidth - 10, size - 0.5, 700) : []),
          ...wrapLines(entry.title, dayWidth - 10, size, 400),
        ],
      })),
    }));
    const height = Math.max(
      23,
      name.length * lineHeight + 8,
      ...cells.map((cell) =>
        cell.entries.reduce((sum, entry) => sum + entry.lines.length * lineHeight + 8, 4),
      ),
    );
    return { member, name, cells, height };
  });
  return {
    week,
    rows,
    size,
    lineHeight,
    height: 41 + rows.reduce((sum, row) => sum + row.height, 0),
  };
}
type WeekLayout = ReturnType<typeof weekLayout>;

function WeekTable({
  layout,
  range,
  rows = layout.rows,
}: {
  layout: WeekLayout;
  range: ReturnType<typeof calendarRange>;
  rows?: WeekLayout["rows"];
}) {
  return (
    <View style={styles.week} wrap={false}>
      <Text style={styles.title}>KW {format(parseISO(layout.week.key), "II")}</Text>
      <View style={styles.head}>
        <Text style={{ ...styles.heading, width: nameWidth }}>Person</Text>
        {layout.week.days.map((day) => (
          <Text key={day} style={{ ...styles.heading, width: dayWidth }}>
            {format(parseISO(day), "EEE dd.MM.", { locale: de })}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={`${row.member.id}-${index}`}
          style={{ ...styles.row, minHeight: row.height }}
          wrap={false}
        >
          <Text style={{ ...styles.cell, ...styles.name, fontSize: layout.size, lineHeight: 1.25 }}>
            {row.name.join("\n")}
          </Text>
          {row.cells.map((cell) => (
            <View
              key={cell.day}
              style={{
                ...styles.cell,
                backgroundColor:
                  cell.day < range.from || cell.day > range.to ? "#f4f4f4" : "#ffffff",
              }}
            >
              {cell.entries.map((entry) => (
                <View key={entry.id} style={{ ...styles.entry, backgroundColor: entry.color }}>
                  <Text style={{ fontSize: layout.size, lineHeight: 1.25, color: entry.textColor }}>
                    {entry.lines.join("\n")}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** No agenda preview/truncation: paginate complete cells only when a week cannot fit. */
function splitWeek(layout: WeekLayout): WeekLayout["rows"][] {
  const rowLimit = availableHeight - 41;
  const segments: WeekLayout["rows"] = [];
  for (const row of layout.rows) {
    if (row.height <= rowLimit) {
      segments.push(row);
      continue;
    }
    const maxLines = Math.max(1, Math.floor((rowLimit - 18) / layout.lineHeight));
    const cells = row.cells.map((cell) => ({
      ...cell,
      entries: cell.entries.flatMap((entry) =>
        Array.from({ length: Math.ceil(entry.lines.length / maxLines) }, (_, i) => ({
          ...entry,
          id: `${entry.id}-${i}`,
          lines: entry.lines.slice(i * maxLines, (i + 1) * maxLines),
        })),
      ),
    }));
    // Individual long entries and crowded days continue in the same date column.
    while (cells.some((cell) => cell.entries.length)) {
      const next = cells.map((cell) => {
        const entries: typeof cell.entries = [];
        let height = 4;
        while (
          cell.entries.length &&
          height + cell.entries[0].lines.length * layout.lineHeight + 8 <= rowLimit
        ) {
          const entry = cell.entries.shift()!;
          entries.push(entry);
          height += entry.lines.length * layout.lineHeight + 8;
        }
        return { day: cell.day, entries };
      });
      segments.push({
        ...row,
        cells: next,
        height: Math.max(
          23,
          row.name.length * layout.lineHeight + 8,
          ...next.map((cell) =>
            cell.entries.reduce(
              (sum, entry) => sum + entry.lines.length * layout.lineHeight + 8,
              4,
            ),
          ),
        ),
      });
    }
  }
  const groups: WeekLayout["rows"][] = [[]];
  let height = 0;
  for (const row of segments) {
    if (height + row.height > rowLimit && groups.at(-1)!.length) {
      groups.push([]);
      height = 0;
    }
    groups.at(-1)!.push(row);
    height += row.height;
  }
  return groups;
}

export function TeamCalendarPdf({
  input,
  wrapLines,
}: {
  input: ExportInput;
  wrapLines: WrapLines;
}) {
  const range = calendarRange(input);
  const weeks = teamCalendarWeeks(input);
  const pages: React.ReactNode[] = [];
  for (let index = 0; index < weeks.length;) {
    let layouts: WeekLayout[] = [];
    if (input.view === "team-month" && index + 1 < weeks.length) {
      for (const size of [9, 8.5, 8]) {
        const pair = [
          weekLayout(input, weeks[index], size, wrapLines),
          weekLayout(input, weeks[index + 1], size, wrapLines),
        ];
        if (pair[0].height + pair[1].height + 14 <= availableHeight) {
          layouts = pair;
          break;
        }
      }
    }
    if (layouts.length) {
      pages.push(
        <PdfPage
          key={weeks[index].key}
          size="A4"
          orientation="landscape"
          style={styles.page}
          wrap={false}
        >
          {layouts.map((layout) => (
            <WeekTable key={layout.week.key} layout={layout} range={range} />
          ))}
        </PdfPage>,
      );
      index += 2;
      continue;
    }
    let layout = weekLayout(input, weeks[index], 9, wrapLines);
    for (const size of [8.5, 8, 7.5]) {
      if (layout.height <= availableHeight) break;
      layout = weekLayout(input, weeks[index], size, wrapLines);
    }
    for (const [part, rows] of splitWeek(layout).entries())
      pages.push(
        <PdfPage
          key={`${weeks[index].key}-${part}`}
          size="A4"
          orientation="landscape"
          style={styles.page}
          wrap={false}
        >
          <WeekTable layout={layout} rows={rows} range={range} />
        </PdfPage>,
      );
    index++;
  }
  return <>{pages}</>;
}

export function CalendarLegendPdf({ input, Page }: { input: ExportInput; Page: PrintPage }) {
  const items = calendarLegend(input);
  return (
    <>
      {Array.from({ length: Math.max(1, Math.ceil(items.length / 10)) }, (_, chunk) => (
        <Page input={input} key={chunk} label="Kalender · Legende">
          <Text style={{ fontSize: 10, marginBottom: 18 }}>
            Die Namen und Farben entsprechen den aktuellen Kalenderkategorien. Ganztägige Termine
            enthalten keine Uhrzeiten; das Enddatum in der Agenda ist der letzte eingeschlossene
            Tag.
          </Text>
          {items.slice(chunk * 10, chunk * 10 + 10).map((item) => (
            <View
              key={item.categoryName}
              wrap={false}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: "#cbd6cf",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{ width: 11, height: 11, backgroundColor: item.color, marginRight: 13 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 700 }}>{item.categoryName}</Text>
                <Text style={{ fontSize: 9, color: "#53645e", marginTop: 4 }}>
                  {item.allDay ? "Ganztägige Kategorie" : "Termin mit Uhrzeit"}
                </Text>
              </View>
            </View>
          ))}
        </Page>
      ))}
    </>
  );
}
