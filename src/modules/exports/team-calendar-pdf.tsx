import React from "react";
import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { calendarRange } from "./calendar";
import { eventDisplay } from "./calendar-presentation";
import {
  calendarLegend,
  eventTimeLabel,
  memberDayEvents,
  teamCalendarMembers,
  teamCalendarWeeks,
} from "./team-calendar";
import type { ExportInput } from "./types";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  landscape?: boolean;
  children: React.ReactNode;
  label?: string;
}>;
const style = StyleSheet.create({
  context: { fontSize: 10, color: "#53645e", marginBottom: 9 },
  header: { flexDirection: "row", backgroundColor: "#1e5f50", color: "white" },
  heading: { width: "12%", fontSize: 9, fontWeight: 700, padding: 6 },
  row: { flexDirection: "row" },
  cell: {
    width: "12%",
    padding: 6,
    borderBottomWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "#cbd6cf",
  },
  name: { width: "16%", fontSize: 9, fontWeight: 700, lineHeight: 1.4 },
  time: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  title: { fontSize: 9, lineHeight: 1.3 },
  extra: { fontSize: 8.5, fontWeight: 700, color: "#1e5f50", marginTop: 4 },
  note: { fontSize: 9, color: "#53645e", marginTop: 9, lineHeight: 1.4 },
});
function wrapName(text: string): string[] {
  const lines: string[] = [];
  let line = "",
    width = 0;
  const measure = (word: string) =>
    [...word].reduce(
      (sum, character) =>
        sum + (/[WM]/u.test(character) ? 9 : /[ilItf\s]/u.test(character) ? 4 : 6),
      0,
    );
  for (const word of text.trim().split(/\s+/u)) {
    const size = measure(word) + (line ? 4 : 0);
    if (width + size > 106 && line) {
      lines.push(line.trimEnd());
      line = "";
      width = 0;
    }
    if (measure(word) > 106) {
      for (const character of word) {
        const characterWidth = measure(character);
        if (width + characterWidth > 106 && line) {
          lines.push(line);
          line = "";
          width = 0;
        }
        line += character;
        width += characterWidth;
      }
    } else {
      if (line) {
        line += " ";
        width += 4;
      }
      line += word;
      width += measure(word);
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
export function TeamCalendarPdf({ input, Page }: { input: ExportInput; Page: PrintPage }) {
  const range = calendarRange(input),
    members = teamCalendarMembers(input);
  const groups: { id: string; name: string; lines: string[]; height: number }[][] = [[]];
  let height = 0;
  for (const member of members) {
    const lines = wrapName(member.name),
      rowHeight = Math.max(64, lines.length * 13 + 12);
    if (
      (height + rowHeight > 320 || groups[groups.length - 1].length === 5) &&
      groups[groups.length - 1].length
    ) {
      groups.push([]);
      height = 0;
    }
    groups[groups.length - 1].push({ ...member, lines, height: rowHeight });
    height += rowHeight;
  }
  return (
    <>
      {teamCalendarWeeks(input).flatMap((week) =>
        groups.map((group, part) => (
          <Page
            input={input}
            landscape
            key={`${week.key}-${part}`}
            label={`Teamplanung · KW ${format(parseISO(week.key), "II")}`}
          >
            <Text style={style.context}>
              {format(parseISO(range.from), "MMMM yyyy", { locale: de })} ·{" "}
              {format(parseISO(week.days[0]), "dd.MM.")} –{" "}
              {format(parseISO(week.days[6]), "dd.MM.")} · Personengruppe {part + 1}/{groups.length}
            </Text>
            <View style={style.header}>
              <Text style={{ ...style.heading, width: "16%" }}>Person</Text>
              {week.days.map((day) => (
                <Text key={day} style={style.heading}>
                  {format(parseISO(day), "EEE dd.MM.", { locale: de })}
                </Text>
              ))}
            </View>
            {!group.length && (
              <Text style={style.note}>
                Keine aktiven Mitarbeiter für die ausgewählten Kalender.
              </Text>
            )}
            {group.map((member) => (
              <View key={member.id} style={style.row} wrap={false}>
                <Text style={{ ...style.cell, ...style.name, height: member.height }}>
                  {member.lines.join("\n")}
                </Text>
                {week.days.map((day) => {
                  const events = memberDayEvents(input, day, member.id),
                    first = events[0],
                    display = first ? eventDisplay(first, input) : undefined;
                  const title = display?.title ?? "",
                    preview = title.length > 17 ? `${title.slice(0, 16)}…` : title;
                  return (
                    <View
                      key={day}
                      style={{
                        ...style.cell,
                        height: member.height,
                        backgroundColor: day < range.from || day > range.to ? "#fafbf9" : "white",
                      }}
                    >
                      {first && (
                        <>
                          <Text
                            style={{
                              ...style.time,
                              borderLeftWidth: 2,
                              borderLeftColor: display!.color,
                              paddingLeft: 3,
                            }}
                          >
                            {eventTimeLabel(first, input)}
                          </Text>
                          <Text style={style.title}>{preview}</Text>
                        </>
                      )}
                      {events.length > 1 && (
                        <Text style={style.extra}>+ {events.length - 1} · Agenda</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
            <Text style={style.note}>
              Gekürzte Rasterübersicht. Die vollständige Agenda enthält alle Dienste und Titel.
              Kategorien und Farben sind in der Legende erklärt.
            </Text>
          </Page>
        )),
      )}
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
