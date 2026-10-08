import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { ComponentType, ReactNode } from "react";
import type { ExportInput } from "./types";
import { dateText, durationSeconds, durationText } from "./data";
import { exportTimeDayMarkers } from "./time";
import { isoWeek } from "../time-tracking/history";
import { shiftDate } from "../../shared/client-api";

/** Human-readable weekly labels never enter raw time rows or duration calculations. */
export function TimeWeeklyPdf({
  input,
  Page,
}: {
  input: ExportInput;
  Page: ComponentType<{ input: ExportInput; label?: string; children: ReactNode }>;
}) {
  const markers = exportTimeDayMarkers(input);
  if (!markers.length) return null;
  const groups = new Map<string, { userId: string; start: string }>();
  for (const marker of markers) {
    const start = isoWeek(marker.date).start;
    groups.set(`${marker.userId}:${start}`, { userId: marker.userId, start });
  }
  for (const record of input.records) {
    const day = String(record.data.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const start = isoWeek(day).start;
    groups.set(`${record.data.userId}:${start}`, { userId: String(record.data.userId), start });
  }
  return (
    <>
      {[...groups.values()]
        .sort((a, b) => a.start.localeCompare(b.start) || a.userId.localeCompare(b.userId))
        .map(({ userId, start }) => {
          const week = isoWeek(start);
          const person = input.members.find((member) => member.id === userId)?.name || userId;
          const rows = input.records.filter(
            (record) =>
              record.data.userId === userId &&
              String(record.data.date) >= start &&
              String(record.data.date) <= week.end,
          );
          const total = rows.reduce((sum, record) => sum + durationSeconds(record), 0);
          return (
            <Page
              key={`${userId}:${start}`}
              input={input}
              label={`${input.kind === "attendance" ? "Anwesenheit" : "Produktionsstunden"} · Wochenübersicht`}
            >
              <Text style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>
                KW {week.number} · {week.year} · {person}
              </Text>
              <Text style={{ fontSize: 10, color: "#53645e", marginBottom: 14 }}>
                {dateText(start)} – {dateText(week.end)} · Gebuchte Zeit: {durationText(total)}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: "#eaf1ed",
                  padding: 9,
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                <Text style={{ width: "28%" }}>Tag / Datum</Text>
                <Text style={{ width: "22%" }}>Gebuchte Zeit</Text>
                <Text style={{ width: "50%" }}>Kalenderkennzeichen</Text>
              </View>
              {Array.from({ length: 7 }, (_, index) => {
                const day = shiftDate(start, index);
                const seconds = rows
                  .filter((record) => record.data.date === day)
                  .reduce((sum, record) => sum + durationSeconds(record), 0);
                const labels = [
                  ...new Set(
                    markers
                      .filter((marker) => marker.userId === userId && marker.date === day)
                      .map((marker) => marker.label),
                  ),
                ];
                return (
                  <View
                    key={day}
                    style={{
                      flexDirection: "row",
                      borderBottomWidth: 0.5,
                      borderColor: "#cbd6cf",
                      padding: 9,
                      fontSize: 10,
                      minHeight: 42,
                    }}
                  >
                    <Text style={{ width: "28%", paddingRight: 8 }}>
                      {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][index]} · {dateText(day)}
                    </Text>
                    <Text style={{ width: "22%", paddingRight: 8 }}>
                      {seconds ? durationText(seconds) : "–"}
                    </Text>
                    <Text style={{ width: "50%" }}>{labels.join(" · ") || "–"}</Text>
                  </View>
                );
              })}
              <Text style={{ fontSize: 9, color: "#53645e", marginTop: 16, lineHeight: 1.5 }}>
                Kalenderkennzeichen wie ABF, Ruhetag, Urlaub oder Krank sind keine Anwesenheits-
                oder Arbeitsstunden. Ungeprüfte geplante Dienste sind nicht Teil dieses Nachweises.
              </Text>
            </Page>
          );
        })}
    </>
  );
}
