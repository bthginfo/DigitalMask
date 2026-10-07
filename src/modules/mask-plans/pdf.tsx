import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { ExportInput } from "@/modules/exports/types";
import { maskPlanExportData } from "./export";
import { maskPlanClock } from "./model";
import { maskPlanPaleColor } from "./layout";
import { compactMaskPlanGrid } from "./compact-print";

type WrapLines = (text: string, width: number, size: number, weight: number) => string[];
const pageWidth = 595.28,
  pageHeight = 841.89,
  margin = 18,
  gap = 12;
const cardWidth = (pageWidth - margin * 2 - gap) / 2;
const cardHeight = (pageHeight - margin * 2 - gap) / 2;
const rail = 34,
  size = 6.5;

/** Four complete quarter-sheet copies; no second list, report headers, or footers. */
export function MaskPlanPages({ input, wrapLines }: { input: ExportInput; wrapLines: WrapLines }) {
  return (
    <>
      {maskPlanExportData(input).map((item) => {
        const { boundaries, columns } = compactMaskPlanGrid(item.plan);
        const columnWidth = (cardWidth - rail) / Math.max(1, columns.length);
        const rowHeights = boundaries.slice(0, -1).map(() => (input.performanceTime ? 20 : 9));
        const appointments = columns.flatMap((column, index) =>
          column.blocks.map((block) => {
            const entry = item.blocks.find((candidate) => candidate.block.id === block.id)!;
            const lines = wrapLines(
              [entry.actors.join(" / "), block.title].filter(Boolean).join(" · "),
              columnWidth - 5,
              size,
              700,
            );
            const first = boundaries.indexOf(block.startMinutes);
            const last = boundaries.indexOf(block.startMinutes + block.durationMinutes);
            const timing = `${block.startMinutes} bis ${block.startMinutes + block.durationMinutes} · ${block.durationMinutes} min`;
            const timingLines = wrapLines(timing, columnWidth - 5, size - 1, 400);
            return { block, index, lines, timingLines, first, last };
          }),
        );
        for (const appointment of appointments) {
          const actual = rowHeights
            .slice(appointment.first, appointment.last)
            .reduce((sum, height) => sum + height, 0);
          const needed =
            appointment.lines.length * size * 1.2 +
            appointment.timingLines.length * (size - 1) * 1.2 +
            5;
          if (actual < needed) {
            const extra = (needed - actual) / Math.max(1, appointment.last - appointment.first);
            for (let row = appointment.first; row < appointment.last; row++)
              rowHeights[row] += extra;
          }
        }
        const headerLines = columns.map((column) => {
          const lane = item.lanes.find((candidate) => candidate.lane.id === column.lane.id)!;
          const label = lane.staff.length
            ? [item.lanes.length > 1 ? lane.label : "", lane.staff.join(" / ")]
                .filter(Boolean)
                .join(" · ")
            : lane.label;
          return wrapLines(label, columnWidth - 5, size, 700);
        });
        const headingHeight = Math.max(
          15,
          ...headerLines.map((lines) => lines.length * size * 1.3 + 10),
        );
        const titleLines = wrapLines(
          `${item.productionTitle} · ${item.plan.title}`,
          cardWidth - 4,
          7.5,
          700,
        );
        const captionHeight = titleLines.length * 9 + 4;
        const bodyHeight = rowHeights.reduce((sum, height) => sum + height, 0);
        const totalHeight = captionHeight + headingHeight + bodyHeight + 16;
        const scale = Math.min(1, (cardHeight - 2) / totalHeight);
        const topFor = (row: number) =>
          rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) * scale;
        return (
          <Page
            key={item.record.id}
            size="A4"
            orientation="portrait"
            style={{ fontFamily: "Noto", color: "#233932" }}
            wrap={false}
          >
            <View style={{ height: pageHeight, width: pageWidth }} />
            {Array.from({ length: 4 }, (_, copy) => (
              <View
                key={copy}
                style={{
                  position: "absolute",
                  left: margin + (copy % 2) * (cardWidth + gap),
                  top: margin + Math.floor(copy / 2) * (cardHeight + gap),
                  width: cardWidth,
                  height: totalHeight * scale,
                }}
              >
                <Text
                  style={{
                    fontSize: 7.5 * scale,
                    fontWeight: 700,
                    height: captionHeight * scale,
                    lineHeight: 1.2,
                  }}
                >
                  {titleLines.join("\n")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    height: headingHeight * scale,
                    borderWidth: 0.6,
                    borderColor: "#233932",
                    backgroundColor: "#edf1ef",
                  }}
                >
                  <Text
                    style={{ width: rail, padding: 2, fontSize: size * scale, fontWeight: 700 }}
                  >
                    ZEIT
                  </Text>
                  {headerLines.map((lines, index) => (
                    <Text
                      key={index}
                      style={{
                        width: columnWidth,
                        padding: 2,
                        fontSize: size * scale,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        borderLeftWidth: 0.4,
                        borderColor: "#83968c",
                      }}
                    >
                      {lines.join("\n")}
                    </Text>
                  ))}
                </View>
                <View
                  style={{
                    height: bodyHeight * scale,
                    position: "relative",
                    borderLeftWidth: 0.6,
                    borderRightWidth: 0.6,
                    borderColor: "#233932",
                  }}
                >
                  {boundaries.slice(0, -1).map((minute, index) => (
                    <View
                      key={minute}
                      style={{
                        position: "absolute",
                        top: topFor(index),
                        left: 0,
                        width: cardWidth,
                        height: rowHeights[index] * scale,
                        borderBottomWidth: 0.25,
                        borderColor: "#b8c6bf",
                      }}
                    >
                      <Text style={{ width: rail, padding: 1.5, fontSize: (size - 1) * scale }}>
                        {minute}
                        {input.performanceTime && (
                          <Text style={{ fontWeight: 700 }}>
                            {`\n${maskPlanClock(minute, input.performanceTime)}`}
                          </Text>
                        )}
                      </Text>
                    </View>
                  ))}
                  {columns.map((column, index) => (
                    <View
                      key={`${column.lane.id}-${column.track}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: rail + index * columnWidth,
                        borderLeftWidth: 0.4,
                        borderColor: "#83968c",
                      }}
                    />
                  ))}
                  {appointments.map(({ block, index, lines, timingLines, first, last }) => (
                    <View
                      key={block.id}
                      style={{
                        position: "absolute",
                        left: rail + index * columnWidth,
                        top: topFor(first),
                        width: columnWidth,
                        height: topFor(last) - topFor(first),
                        backgroundColor: maskPlanPaleColor(block.color || item.color),
                        borderWidth: 0.4,
                        borderColor: "#83968c",
                        padding: 2 * scale,
                      }}
                    >
                      <Text style={{ fontSize: size * scale, lineHeight: 1.2, fontWeight: 700 }}>
                        {lines.join("\n")}
                      </Text>
                      <Text
                        style={{ marginTop: scale, fontSize: (size - 1) * scale, lineHeight: 1.2 }}
                      >
                        {timingLines.join("\n")}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text
                  style={{
                    height: 16 * scale,
                    padding: 2 * scale,
                    borderWidth: 0.6,
                    borderColor: "#233932",
                    fontSize: size * scale,
                    fontWeight: 700,
                    backgroundColor: "#f6d3ca",
                  }}
                >
                  0 · Beginn{input.performanceTime ? ` · ${input.performanceTime}` : ""}
                </Text>
              </View>
            ))}
          </Page>
        );
      })}
    </>
  );
}
