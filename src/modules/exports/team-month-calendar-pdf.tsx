import React from "react";
import { Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, getDay, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { teamMonthPrintLayouts, teamMonthPrintMetrics as m } from "./team-month-print-layout";
import { calendarPrintDayBackground } from "./team-calendar-print";

const styles = StyleSheet.create({
  page: {
    minHeight: m.pageHeight,
    maxHeight: m.pageHeight,
    padding: m.margin,
    fontFamily: "NotoCondensed",
    fontSize: m.fontSize,
    color: "#172a22",
  },
  title: { height: m.titleHeight, fontSize: 10, lineHeight: 1.08, fontWeight: 700 },
  matrix: { borderWidth: m.border, borderColor: "#1e3129" },
  row: { flexDirection: "row" },
  heading: { fontSize: m.fontSize, fontWeight: 700, lineHeight: 1.08, textAlign: "center" },
  text: { fontSize: m.fontSize, lineHeight: 1.08 },
});

export function TeamMonthCalendarPdf({
  layouts,
}: {
  layouts: ReturnType<typeof teamMonthPrintLayouts>;
}) {
  return (
    <>
      {layouts.map(({ block, rows, width, dayWidth }) => (
        <Page key={block.key} size="A4" orientation="landscape" style={styles.page} wrap={false}>
          <Text style={styles.title}>{block.title}</Text>
          <View style={{ ...styles.matrix, width }} wrap={false}>
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
                <Text style={styles.heading}>Person</Text>
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
                  <Text style={styles.heading}>
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
                  <Text style={{ ...styles.text, fontWeight: 700 }}>
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
                        <Text style={{ ...styles.text, color: entry.textColor }}>
                          {entry.lines.join("\n")}
                        </Text>
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
