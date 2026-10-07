import React from "react";
import { Page as PdfPage, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { calendarLegend } from "./team-calendar";
import {
  teamCalendarBlocks,
  teamCalendarRows,
  teamCalendarPrintStyle as metrics,
} from "./team-calendar-layout";
import type { ExportInput } from "./types";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  landscape?: boolean;
  children: React.ReactNode;
  label?: string;
}>;
type WrapLines = (text: string, width: number, size: number, weight: number) => string[];
const pageWidth = 841.89,
  pageHeight = 595.28;
const horizontalMargin = metrics.margins.left * 72,
  verticalMargin = metrics.margins.top * 72;
const points = (width: number) => (width * 7 + 5) * 0.75;
const styles = StyleSheet.create({
  page: {
    minHeight: pageHeight,
    maxHeight: pageHeight,
    paddingHorizontal: horizontalMargin,
    paddingVertical: verticalMargin,
    fontFamily: "Noto",
    color: "#233932",
  },
  matrix: { borderWidth: 1.2, borderColor: "#000000" },
  row: { flexDirection: "row" },
  cell: { padding: 2, borderRightWidth: 0.3, borderRightColor: "#b8c6bf" },
});

function printLayout(
  input: ExportInput,
  block: ReturnType<typeof teamCalendarBlocks>[number],
  wrapLines: WrapLines,
  density = 1,
) {
  const compact = block.days.length > 7;
  const nameWidth = points(metrics.nameWidth),
    dayWidth = points(compact ? metrics.monthDayWidth : metrics.dayWidth);
  const rawWidth = nameWidth + dayWidth * block.days.length;
  const scale = Math.min(metrics.scale / 100, (pageWidth - 2 * horizontalMargin - 2.4) / rawWidth);
  const size = (compact ? metrics.monthFontSize : metrics.fontSize) * density;
  const rows = teamCalendarRows(input, block.days, (line) =>
    // Leave shaping/padding room at narrow widths, especially at adaptive-size thresholds.
    wrapLines(line, dayWidth - (compact ? 8 : 6), size, 400),
  ).map((row) => {
    return {
      ...row,
      slots: Math.max(
        input.view === "team-month" ? 1 : row.slots,
        Math.ceil(
          (wrapLines(row.member.name, nameWidth - 6, metrics.nameFontSize * density, 700).length *
            metrics.nameFontSize *
            1.2) /
            metrics.rowHeight,
        ),
        ...row.cells.map((cell) => cell.length),
      ),
    };
  });
  const maxSlots = Math.max(
    2,
    Math.floor(
      (pageHeight -
        2 * verticalMargin -
        (metrics.titleHeight + metrics.headingHeight) * scale -
        3) /
        (metrics.rowHeight * scale),
    ),
  );
  const pages: (typeof rows)[] = [[]];
  let used = 0;
  for (const row of input.view === "team-month" ? [] : rows) {
    let offset = 0;
    while (offset < row.slots) {
      const remaining = maxSlots - used;
      if (!remaining || (row.slots <= maxSlots && row.slots > remaining)) {
        pages.push([]);
        used = 0;
        continue;
      }
      const slots = Math.min(row.slots - offset, maxSlots - used);
      pages.at(-1)!.push({
        ...row,
        cells: row.cells.map((cell) => cell.slice(offset, offset + slots)),
        slots,
      });
      offset += slots;
      used += slots;
    }
  }
  return {
    block,
    rows,
    pages,
    scale,
    density,
    size,
    nameWidth: nameWidth * scale,
    dayWidth: dayWidth * scale,
    width: rawWidth * scale,
    height:
      density *
      (metrics.titleHeight +
        metrics.headingHeight +
        rows.reduce((sum, row) => sum + row.slots * metrics.rowHeight, 0) +
        2.4 +
        Math.max(0, rows.length - 1) * 0.6),
  };
}

type CalendarLayout = ReturnType<typeof printLayout>;

function calendarPages(input: ExportInput, wrapLines: WrapLines) {
  const layouts = teamCalendarBlocks(input).map((block) => printLayout(input, block, wrapLines));
  if (input.view !== "team-month")
    return layouts.flatMap((layout) => layout.pages.map((rows) => [{ ...layout, rows }]));
  const months = new Map<string, CalendarLayout[]>();
  for (const layout of layouts) {
    const month = layout.block.key.slice(0, 7);
    const group = months.get(month) || [];
    group.push(layout);
    months.set(month, group);
  }
  return [...months.values()].map((month) => {
    const available = pageHeight - 2 * verticalMargin - (month.length - 1) * 12 - 3;
    const heightOf = (layouts: CalendarLayout[]) =>
      layouts.reduce((sum, layout) => sum + layout.height * layout.scale, 0);
    const height = heightOf(month);
    if (height <= available) return month;
    // Keep the complete column width and reflow text as fonts/rows become denser.
    // Bounded refinement finds a readable fit without shrinking the whole table horizontally.
    const atDensity = (density: number) =>
      month.map((layout) => printLayout(input, layout.block, wrapLines, density));
    let lower = (available / height) * 0.98,
      upper = 1,
      fitted = atDensity(lower);
    for (let attempt = 0; attempt < 7; attempt++) {
      const density = (lower + upper) / 2;
      const candidate = atDensity(density);
      if (heightOf(candidate) <= available) {
        lower = density;
        fitted = candidate;
      } else upper = density;
    }
    return fitted;
  });
}

function CalendarMatrix({ layout }: { layout: CalendarLayout }) {
  const { block, rows, scale, density, dayWidth, nameWidth } = layout;
  const verticalScale = scale * density;
  return (
    <>
      <Text
        style={{
          height: metrics.titleHeight * verticalScale,
          fontSize: metrics.titleFontSize * verticalScale,
          fontWeight: 700,
        }}
      >
        {block.title}
      </Text>
      <View style={{ ...styles.matrix, borderWidth: 1.2 * verticalScale, width: layout.width }}>
        <View
          style={{
            ...styles.row,
            height: metrics.headingHeight * verticalScale,
            backgroundColor: "#edf1ef",
            borderBottomWidth: verticalScale,
            borderBottomColor: "#000000",
          }}
        >
          {[
            "Person",
            ...block.days.map((day) =>
              day
                ? format(parseISO(day), block.days.length > 7 ? "EEEdd.MM." : "EEE dd.MM.", {
                    locale: de,
                  })
                : "",
            ),
          ].map((label, index) => (
            <Text
              key={index}
              style={{
                ...styles.cell,
                padding: 2 * verticalScale,
                borderRightWidth: 0.3 * verticalScale,
                width: index ? dayWidth : nameWidth,
                fontSize: metrics.headingFontSize * verticalScale,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View
            key={`${row.member.id}-${index}`}
            style={{
              ...styles.row,
              borderBottomWidth: index === rows.length - 1 ? 0 : 0.6 * verticalScale,
              borderBottomColor: "#83968c",
            }}
            wrap={false}
          >
            <View
              style={{
                ...styles.cell,
                padding: 2 * verticalScale,
                borderRightWidth: 0.3 * verticalScale,
                width: nameWidth,
                justifyContent: "center",
                backgroundColor: "#ffffff",
              }}
            >
              <Text
                style={{
                  fontSize: metrics.nameFontSize * verticalScale,
                  fontWeight: 700,
                  lineHeight: 1.15,
                }}
              >
                {row.member.name}
              </Text>
            </View>
            {block.days.map((day, dayIndex) => (
              <View
                key={`${day}-${dayIndex}`}
                style={{
                  width: dayWidth,
                  borderRightWidth: dayIndex === block.days.length - 1 ? 0 : 0.3 * verticalScale,
                  borderRightColor: "#b8c6bf",
                }}
              >
                {Array.from({ length: row.slots }, (_, slot) => {
                  const entry = row.cells[dayIndex][slot];
                  return (
                    <View
                      key={slot}
                      style={{
                        height: metrics.rowHeight * verticalScale,
                        paddingVertical: 2 * verticalScale,
                        paddingHorizontal: (block.days.length > 7 ? 0.75 : 2) * verticalScale,
                        backgroundColor: entry?.color || "#ffffff",
                      }}
                    >
                      {entry && (
                        <Text
                          style={{
                            fontSize: layout.size * scale,
                            color: entry.textColor,
                            lineHeight: block.days.length > 7 ? 1.1 : 1.2,
                          }}
                        >
                          {entry.text}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
    </>
  );
}

/** Complete coloured matrices: both month halves and every person fit on one A4 page. */
export function TeamCalendarPdf({
  input,
  wrapLines,
}: {
  input: ExportInput;
  wrapLines: WrapLines;
}) {
  return (
    <>
      {calendarPages(input, wrapLines).map((layouts, page) => (
        <PdfPage key={page} size="A4" orientation="landscape" style={styles.page} wrap={false}>
          {layouts.map((layout, index) => (
            <View
              key={layout.block.key}
              wrap={false}
              style={{ marginBottom: index === layouts.length - 1 ? 0 : 12 }}
            >
              <CalendarMatrix layout={layout} />
            </View>
          ))}
        </PdfPage>
      ))}
    </>
  );
}

export function CalendarLegendPdf({ input, Page }: { input: ExportInput; Page: PrintPage }) {
  const items = calendarLegend(input);
  return (
    <>
      {Array.from({ length: Math.max(1, Math.ceil(items.length / 10)) }, (_, chunk) => (
        <Page input={input} key={chunk} label="Kalender · Legende">
          <Text style={{ fontSize: 10, marginBottom: 18 }}>
            Ganztägige Termine enthalten keine Uhrzeiten. Die Farben entsprechen den
            Kalenderkategorien und Produktionen.
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
