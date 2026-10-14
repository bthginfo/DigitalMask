import React from "react";
import { Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, getDay, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  teamMonthPrintLayouts,
  teamMonthPrintMetrics as defaults,
} from "./team-month-print-layout";
import { calendarPrintDayBackground } from "./team-calendar-print";

const styles = StyleSheet.create({
  page: {
    minHeight: defaults.pageHeight,
    maxHeight: defaults.pageHeight,
    padding: defaults.margin,
    fontFamily: "NotoCondensed",
    fontSize: defaults.fontSize,
    color: "#172a22",
  },
  title: { lineHeight: 1.08, fontWeight: 700 },
  matrix: { borderColor: "#1e3129" },
  row: { flexDirection: "row" },
  heading: { fontWeight: 700, lineHeight: 1.08, textAlign: "center" },
  text: { lineHeight: 1.08 },
});

export function TeamMonthCalendarPdf({
  layouts,
}: {
  layouts: ReturnType<typeof teamMonthPrintLayouts>;
}) {
  return (
    <>
      {layouts.map(({ block, rows, width, dayWidth, metrics: m }) => (
        <Page
          key={block.key}
          size="A4"
          orientation="landscape"
          style={{ ...styles.page, padding: m.margin, fontSize: m.fontSize }}
          wrap={false}
        >
          <Text style={{ ...styles.title, fontSize: m.fontSize, height: m.titleHeight }}>
            {block.title}
          </Text>
          <View style={{ ...styles.matrix, borderWidth: m.border, width }} wrap={false}>
            <View
              style={{
                ...styles.row,
                height: m.headingHeight,
                borderBottomWidth: m.border,
                borderBottomColor: "#1e3129",
              }}
            >
              <View
                style={{ width: m.nameWidth, justifyContent: "center", backgroundColor: "#edf1ef" }}
              >
                <Text style={{ ...styles.heading, fontSize: m.fontSize }}>Person</Text>
              </View>
              {block.days.map((day) => (
                <View
                  key={day}
                  style={{
                    width: dayWidth,
                    justifyContent: "center",
                    borderLeftWidth: m.border,
                    borderLeftColor: "#b4c0b8",
                    backgroundColor: [0, 6].includes(getDay(parseISO(day))) ? "#e2e8e3" : "#edf1ef",
                  }}
                >
                  <Text style={{ ...styles.heading, fontSize: m.fontSize }}>
                    {format(parseISO(day), "EEE", { locale: de })}
                    {"\n"}
                    {format(parseISO(day), "dd.MM.")}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((row, index) => (
              <View
                key={row.member.id || "guests"}
                style={{
                  ...styles.row,
                  height: row.height,
                  borderBottomWidth: index === rows.length - 1 ? 0 : m.border,
                  borderBottomColor: "#83968c",
                }}
                wrap={false}
              >
                <View style={{ width: m.nameWidth, padding: m.padding, justifyContent: "center" }}>
                  <Text style={{ ...styles.text, fontSize: m.fontSize, fontWeight: 700 }}>
                    {row.nameLines.join("\n")}
                  </Text>
                </View>
                {row.cells.map((entries, day) => (
                  <View
                    key={block.days[day]}
                    style={{
                      width: dayWidth,
                      backgroundColor: calendarPrintDayBackground(entries),
                      borderLeftWidth: m.border,
                      borderLeftColor: "#b4c0b8",
                    }}
                  >
                    {entries.map((entry, entryIndex) => (
                      <View
                        key={`${entry.id}-${entryIndex}`}
                        style={{
                          height: entry.height,
                          padding: m.padding,
                          marginBottom: entryIndex === entries.length - 1 ? 0 : m.entryGap,
                          backgroundColor: entry.color,
                        }}
                        wrap={false}
                      >
                        {/* Keep measured lines separate so fixed-height cells cannot reflow/truncate a final paragraph. */}
                        {entry.lines.map((line, lineIndex) => (
                          <Text
                            key={lineIndex}
                            style={{
                              ...styles.text,
                              position: "absolute",
                              left: m.padding,
                              right: m.padding,
                              top: m.padding + lineIndex * m.lineHeight,
                              height: m.lineHeight + m.textSafety,
                              fontSize: m.fontSize,
                              color: entry.textColor,
                            }}
                          >
                            {line}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Page>
      ))}
    </>
  );
}
