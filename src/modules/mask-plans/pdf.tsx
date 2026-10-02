import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ExportInput } from "@/modules/exports/types";
import { maskPlanExportData } from "./export";
import { maskPlanClock } from "./model";
import { maskPlanPaleColor, maskPlanPrintSegments, maskPlanTracks } from "./layout";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  landscape?: boolean;
  children: React.ReactNode;
  label?: string;
}>;
type WrapLines = (text: string, width: number, size: number, weight: number) => string[];
const width = 778;
const rail = 56;
const rowHeight = 24;
const styles = StyleSheet.create({
  caption: { fontSize: 9, color: "#53645e", marginBottom: 10 },
  heading: {
    flexDirection: "row",
    backgroundColor: "#eaf1ed",
    borderWidth: 0.5,
    borderColor: "#bfcfc7",
  },
  staff: { padding: 6, borderLeftWidth: 0.5, borderColor: "#bfcfc7" },
  staffName: { fontSize: 9, fontWeight: 700, lineHeight: 1.3 },
  laneLabel: { fontSize: 8, color: "#53645e", lineHeight: 1.3, marginBottom: 3 },
  body: { position: "relative", borderWidth: 0.5, borderColor: "#bfcfc7" },
  line: {
    position: "absolute",
    left: 0,
    right: 0,
    height: rowHeight,
    borderBottomWidth: 0.5,
    borderColor: "#d5dfd9",
  },
  time: { width: rail, paddingHorizontal: 5, paddingTop: 3, fontSize: 9, fontWeight: 700 },
  clock: { fontSize: 7.5, color: "#53645e", fontWeight: 400, marginTop: 1 },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderLeftWidth: 0.5,
    borderColor: "#bfcfc7",
  },
  block: {
    position: "absolute",
    padding: 4,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#a7bcb0",
    overflow: "hidden",
  },
  blockText: { fontSize: 9, lineHeight: 1.22, color: "#233932" },
  begin: {
    padding: 7,
    backgroundColor: "#f6d3ca",
    fontSize: 10,
    fontWeight: 700,
    borderWidth: 0.5,
    borderColor: "#d9aaa0",
  },
  section: { fontSize: 12, fontWeight: 700, marginBottom: 8, marginTop: 8 },
  detail: { padding: 10, borderBottomWidth: 0.5, borderColor: "#cbd6cf" },
  detailTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  detailMeta: { fontSize: 9, color: "#53645e", marginBottom: 4 },
  paragraph: { fontSize: 10, lineHeight: 1.4, marginBottom: 7 },
});

export function MaskPlanPages({
  input,
  Page,
  availableHeight,
  wrapLines,
}: {
  input: ExportInput;
  Page: PrintPage;
  availableHeight: (label: string) => number;
  wrapLines: WrapLines;
}) {
  const plans = maskPlanExportData(input);
  if (!plans.length)
    return (
      <Page input={input} landscape>
        <Text>Keine Maskenpläne ausgewählt.</Text>
      </Page>
    );
  return (
    <>
      {plans.map((item) => {
        const label = `${item.productionTitle} · ${item.plan.title}`;
        // A one-minute editing raster need not turn a long printable plan into dozens of pages.
        const plan =
          item.plan.stepMinutes === 1 && item.plan.windowMinutes > 30
            ? { ...item.plan, stepMinutes: 5 as const }
            : item.plan;
        const laneWidth = (width - rail) / Math.max(1, Math.min(4, plan.lanes.length));
        const headers = new Map(
          item.lanes.map((lane) => [
            lane.lane.id,
            {
              names: wrapLines(
                lane.staff.join(" / ") || "Noch kein Personal gewählt",
                laneWidth - 12,
                9,
                700,
              ),
              label: wrapLines(lane.label, laneWidth - 12, 8, 400),
            },
          ]),
        );
        const headerHeight = Math.max(
          34,
          ...[...headers.values()].map(
            (header) =>
              12 + Math.min(4, header.names.length) * 12 + Math.min(2, header.label.length) * 11,
          ),
        );
        const slots = Math.max(
          1,
          Math.floor((availableHeight(label) - headerHeight - 52) / rowHeight),
        );
        const segments = maskPlanPrintSegments(plan, slots);
        const tracks = new Map(
          plan.lanes.map((lane) => [
            lane.id,
            maskPlanTracks(plan.blocks.filter((block) => block.laneId === lane.id)),
          ]),
        );
        let needsDetails = Boolean(
          plan.notes ||
          plan.blocks.some((block) => block.notes) ||
          [...headers.values()].some(
            (header) => header.names.length > 4 || header.label.length > 2,
          ),
        );
        const pages = segments.map((segment, pageIndex) => {
          const columnWidth = (width - rail) / Math.max(1, segment.lanes.length);
          const height = ((segment.end - segment.start) / plan.stepMinutes) * rowHeight;
          const appointments = item.blocks.flatMap((appointment) => {
            const laneIndex = segment.lanes.findIndex(
              (lane) => lane.id === appointment.block.laneId,
            );
            const start = Math.max(segment.start, appointment.block.startMinutes),
              end = Math.min(
                segment.end,
                appointment.block.startMinutes + appointment.block.durationMinutes,
              );
            if (laneIndex === -1 || end <= start) return [];
            const position = tracks.get(appointment.block.laneId)!.get(appointment.block.id)!;
            const blockWidth = columnWidth / position.count - 4;
            const blockHeight = ((end - start) / plan.stepMinutes) * rowHeight - 2;
            const text = `${appointment.number} · ${[appointment.actors.join(" / "), appointment.block.title].filter(Boolean).join(" · ")}\n${appointment.block.startMinutes} bis ${appointment.block.startMinutes + appointment.block.durationMinutes} · ${appointment.block.durationMinutes} min`;
            const lines = wrapLines(text, Math.max(10, blockWidth - 8), 9, 400);
            const maxLines = Math.max(0, Math.floor((blockHeight - 8) / 11));
            if (
              lines.length > maxLines ||
              start !== appointment.block.startMinutes ||
              end !== appointment.block.startMinutes + appointment.block.durationMinutes
            )
              needsDetails = true;
            const visible = lines.slice(0, maxLines);
            if (visible.length && lines.length > maxLines)
              visible[visible.length - 1] = `${visible[visible.length - 1].slice(0, -1)}…`;
            return [
              <View
                key={appointment.block.id}
                style={{
                  ...styles.block,
                  top: ((start - segment.start) / plan.stepMinutes) * rowHeight + 1,
                  left:
                    rail +
                    laneIndex * columnWidth +
                    (position.track * columnWidth) / position.count +
                    2,
                  width: blockWidth,
                  height: Math.max(1, blockHeight),
                  backgroundColor: maskPlanPaleColor(appointment.block.color || item.color),
                }}
              >
                <Text style={styles.blockText}>{visible.join("\n")}</Text>
              </View>,
            ];
          });
          return (
            <Page key={`${item.record.id}-${pageIndex}`} input={input} label={label} landscape>
              <Text style={styles.caption}>
                Minuten vor Vorstellungsbeginn · {segment.start} bis {segment.end}
                {input.performanceTime ? ` · Beginn ${input.performanceTime} Uhr` : ""}
                {segment.groups > 1
                  ? ` · Personalspalten ${segment.group + 1} von ${segment.groups}`
                  : ""}
              </Text>
              <View style={{ ...styles.heading, height: headerHeight }} wrap={false}>
                <View style={{ width: rail, padding: 6 }}>
                  <Text style={styles.staffName}>ZEIT</Text>
                </View>
                {segment.lanes.map((lane) => {
                  const header = headers.get(lane.id)!;
                  return (
                    <View key={lane.id} style={{ ...styles.staff, width: columnWidth }}>
                      <Text style={styles.laneLabel}>{header.label.slice(0, 2).join("\n")}</Text>
                      <Text style={styles.staffName}>
                        {header.names.slice(0, 4).join("\n")}
                        {header.names.length > 4 ? "…" : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ ...styles.body, height }} wrap={false}>
                {Array.from(
                  { length: (segment.end - segment.start) / plan.stepMinutes },
                  (_, index) => {
                    const minute = segment.start + index * plan.stepMinutes;
                    return (
                      <View key={minute} style={{ ...styles.line, top: index * rowHeight }}>
                        <View style={styles.time}>
                          <Text>{minute}</Text>
                          {input.performanceTime && (
                            <Text style={styles.clock}>
                              {maskPlanClock(minute, input.performanceTime)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  },
                )}
                {segment.lanes.map((lane, index) => (
                  <View
                    key={lane.id}
                    style={{ ...styles.divider, left: rail + index * columnWidth }}
                  />
                ))}
                {appointments}
              </View>
              <Text style={styles.begin}>
                {segment.end === 0
                  ? `0 · Beginn${input.performanceTime ? ` · ${input.performanceTime} Uhr` : ""}`
                  : `Fortsetzung ab ${segment.end} min`}
              </Text>
            </Page>
          );
        });
        if (!needsDetails) return <React.Fragment key={item.record.id}>{pages}</React.Fragment>;
        return (
          <React.Fragment key={item.record.id}>
            {pages}
            <Page input={input} label={`${label} · Vollständiger Ablauf`} landscape>
              {plan.notes && (
                <>
                  <Text style={styles.section}>Hinweise zum Maskenplan</Text>
                  <Text style={styles.paragraph}>{plan.notes}</Text>
                </>
              )}
              <Text style={styles.section}>Maskenpersonal</Text>
              {item.lanes.map((lane) => (
                <Text key={lane.lane.id} style={styles.paragraph}>
                  {lane.label}: {lane.staff.join(" / ") || "Noch kein Personal gewählt"}
                </Text>
              ))}
              <Text style={styles.section}>Zeitblöcke</Text>
              {item.blocks.map(({ block, number, actors, lane }) => (
                <View key={block.id} style={styles.detail}>
                  <Text style={styles.detailTitle}>
                    {number} · {[actors.join(" / "), block.title].filter(Boolean).join(" · ")}
                  </Text>
                  <Text style={styles.detailMeta}>
                    {block.startMinutes} bis {block.startMinutes + block.durationMinutes} min ·{" "}
                    {block.durationMinutes} Minuten · {lane.label} · {lane.staff.join(" / ")}
                    {input.performanceTime
                      ? ` · ${maskPlanClock(block.startMinutes, input.performanceTime)} bis ${maskPlanClock(block.startMinutes + block.durationMinutes, input.performanceTime)}`
                      : ""}
                  </Text>
                  {block.notes && <Text style={styles.paragraph}>{block.notes}</Text>}
                </View>
              ))}
            </Page>
          </React.Fragment>
        );
      })}
    </>
  );
}
