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
) {
  const compact = block.days.length > 7;
  const nameWidth = points(metrics.nameWidth),
    dayWidth = points(compact ? metrics.monthDayWidth : metrics.dayWidth);
  const rawWidth = nameWidth + dayWidth * block.days.length;
  const scale = Math.min(metrics.scale / 100, (pageWidth - 2 * horizontalMargin - 2.4) / rawWidth);
  const size = compact ? metrics.monthFontSize : metrics.fontSize;
  const rows = teamCalendarRows(input, block.days, (line) =>
    wrapLines(line, dayWidth - (compact ? 2 : 6), size, 400),
  ).map((row) => {
    return {
      ...row,
      slots: Math.max(
        row.slots,
        Math.ceil(
          (wrapLines(row.member.name, nameWidth - 6, metrics.nameFontSize, 700).length *
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
  for (const row of rows) {
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
    size,
    nameWidth: nameWidth * scale,
    dayWidth: dayWidth * scale,
    width: rawWidth * scale,
  };
}

/** The same complete coloured matrix and typography proportions as the Excel template. */
export function TeamCalendarPdf({
  input,
  wrapLines,
}: {
  input: ExportInput;
  wrapLines: WrapLines;
}) {
  return (
    <>
      {teamCalendarBlocks(input).flatMap((block) => {
        const layout = printLayout(input, block, wrapLines);
        const { scale, dayWidth, nameWidth } = layout;
        return layout.pages.map((rows, part) => (
          <PdfPage
            key={`${block.key}-${part}`}
            size="A4"
            orientation="landscape"
            style={styles.page}
          >
            <Text
              style={{
                height: metrics.titleHeight * scale,
                fontSize: metrics.titleFontSize * scale,
                fontWeight: 700,
              }}
            >
              {block.title}
            </Text>
            <View style={{ ...styles.matrix, width: layout.width }}>
              <View
                style={{
                  ...styles.row,
                  height: metrics.headingHeight * scale,
                  backgroundColor: "#edf1ef",
                  borderBottomWidth: 1,
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
                      width: index ? dayWidth : nameWidth,
                      fontSize: metrics.headingFontSize * scale,
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
                    borderBottomWidth: index === rows.length - 1 ? 0 : 0.6,
                    borderBottomColor: "#83968c",
                  }}
                  wrap={false}
                >
                  <View
                    style={{
                      ...styles.cell,
                      width: nameWidth,
                      justifyContent: "center",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: metrics.nameFontSize * scale,
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
                        borderRightWidth: dayIndex === block.days.length - 1 ? 0 : 0.3,
                        borderRightColor: "#b8c6bf",
                      }}
                    >
                      {Array.from({ length: row.slots }, (_, slot) => {
                        const entry = row.cells[dayIndex][slot];
                        return (
                          <View
                            key={slot}
                            style={{
                              height: metrics.rowHeight * scale,
                              paddingVertical: 2 * scale,
                              paddingHorizontal: (block.days.length > 7 ? 0.75 : 2) * scale,
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
          </PdfPage>
        ));
      })}
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
