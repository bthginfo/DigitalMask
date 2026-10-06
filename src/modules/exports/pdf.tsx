import React from "react";
import path from "node:path";
import sharp from "sharp";
import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  cellText,
  columnsFor,
  dateText,
  durationSeconds,
  durationText,
  exportRows,
  exportTitle,
  exportPeriod,
  readable,
  titles,
} from "./data";
import { DocumentPages } from "./document-pdf";
import { ProductionPages } from "./production-pdf";
import { MaskPlanPages } from "../mask-plans/pdf";
import { calendarRange, localDay } from "./calendar";
import type { Column, ExportInput, ExportRow } from "./types";
import { addPageNumbers } from "./page-numbers";
import { TeamCalendarPdf, CalendarLegendPdf } from "./team-calendar-pdf";
import { eventTimeLabel } from "./team-calendar";
import { durationSummary } from "./duration-summary";
import { TimeWeeklyPdf } from "./time-weekly-pdf";

Font.register({
  family: "Noto",
  fonts: [
    {
      src: path.join(process.cwd(), "src/modules/exports/assets/NotoSans-Regular.ttf"),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), "src/modules/exports/assets/NotoSans-Bold.ttf"),
      fontWeight: 700,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);
let fontsReady: Promise<void> | undefined;
export function prepareFonts() {
  // Fontkit caches component glyphs with empty codePoints while subsetting. If a
  // later PDF first uses that glyph as text, its ToUnicode map would be empty.
  // Seed the Unicode glyphs once before any layout/subset work; preserve the
  // shared parsed fonts without per-request file reads or global font resets.
  fontsReady ??= Promise.all(
    [400, 700].map(async (fontWeight) => {
      const source = Font.getFont({ fontFamily: "Noto", fontWeight });
      await source.load();
      const font = source.data;
      if (!font) throw new Error("Die PDF-Schrift konnte nicht geladen werden.");
      for (const codePoint of font.characterSet) font.glyphForCodePoint(codePoint);
    }),
  ).then(() => undefined);
  return fontsReady;
}
const colors = {
  ink: "#233932",
  muted: "#53645e",
  accent: "#1e5f50",
  pale: "#eaf1ed",
  line: "#cbd6cf",
  paper: "#fafbf9",
};
const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto",
    fontSize: 10,
    color: colors.ink,
    paddingHorizontal: 32,
    paddingTop: 122,
    paddingBottom: 47,
    lineHeight: 1.4,
  },
  header: {
    position: "absolute",
    left: 32,
    right: 32,
    top: 24,
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingBottom: 13,
  },
  brand: { fontSize: 9, fontWeight: 700, color: colors.accent, marginBottom: 7, letterSpacing: 1 },
  title: { fontSize: 21, fontWeight: 700, lineHeight: 1.25, minHeight: 29, marginBottom: 7 },
  meta: { fontSize: 9, lineHeight: 1.4, color: colors.muted },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    height: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    color: colors.muted,
    fontSize: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 5 },
  tableHeader: {
    position: "absolute",
    top: 122,
    left: 32,
    right: 32,
    flexDirection: "row",
    backgroundColor: colors.accent,
    color: "white",
    minHeight: 29,
  },
  th: { paddingVertical: 8, paddingHorizontal: 7, fontSize: 9, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: colors.line },
  td: { paddingVertical: 9, paddingHorizontal: 7, fontSize: 9, lineHeight: 1.45 },
  summary: { padding: 13, marginTop: 16, backgroundColor: colors.pale, fontWeight: 700 },
  note: { fontSize: 9, color: colors.muted, marginVertical: 10 },
  gridHead: { flexDirection: "row", backgroundColor: colors.accent, color: "white" },
  gridRow: { flexDirection: "row" },
  gridCell: {
    width: "14.2857%",
    borderBottomWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: colors.line,
    padding: 6,
  },
  dayLabel: { fontSize: 9, fontWeight: 700, marginBottom: 4 },
  event: { fontSize: 8.5, lineHeight: 1.25, marginBottom: 3 },
  extra: { fontSize: 8.5, fontWeight: 700, color: colors.accent },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 9, fontWeight: 700, color: colors.accent, marginBottom: 5 },
  fieldText: { fontSize: 10, lineHeight: 1.5 },
  image: { maxHeight: 280, maxWidth: "100%", objectFit: "contain" },
});
function headerLines(text: string, width: number, size: number, weight: number, spacing = 0) {
  const font = Font.getFont({ fontFamily: "Noto", fontWeight: weight }).data;
  if (!font) throw new Error("Die PDF-Schrift ist noch nicht vorbereitet.");
  const measure = (value: string) =>
    Array.from(value).reduce(
      (sum, char) =>
        sum +
        (font.glyphForCodePoint(char.codePointAt(0)!).advanceWidth * size) / font.unitsPerEm +
        spacing,
      0,
    );
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line}${word}`) > width) {
        lines.push(line.trimEnd());
        line = "";
      }
      // Long unbroken names/identifiers must remain inside the printable area.
      for (const char of Array.from(word)) {
        if (line && measure(`${line}${char}`) > width) {
          lines.push(line.trimEnd());
          line = "";
        }
        line += char;
      }
      line += " ";
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
function headerLayout(input: ExportInput, label?: string, landscape = false) {
  const width = (landscape ? 841.89 : 595.28) - 64;
  const brand = headerLines(`DIGITALMASK / ${input.department.toUpperCase()}`, width, 9, 700, 1);
  const title = headerLines(label ?? exportTitle(input), width, 21, 700);
  const meta = headerLines(`${input.organization} · ${exportPeriod(input)}`, width, 9, 400);
  const bottom =
    24 + brand.length * 12.6 + 7 + Math.max(29, title.length * 26.25) + 7 + meta.length * 12.6 + 13;
  return {
    brand: brand.join("\n"),
    title: title.join("\n"),
    meta: meta.join("\n"),
    bodyTop: Math.max(122, Math.ceil(bottom + 18)),
  };
}
function Header({ layout }: { layout: ReturnType<typeof headerLayout> }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brand}>{layout.brand}</Text>
      <Text style={styles.title}>{layout.title}</Text>
      <Text style={styles.meta}>{layout.meta}</Text>
    </View>
  );
}
function Footer({ landscape }: { landscape: boolean }) {
  return (
    <View style={{ ...styles.footer, top: landscape ? 560 : 806 }} fixed>
      <Text style={{ fontSize: 8, lineHeight: 1.2 }}>
        DigitalMask · Interner Arbeitsstand · Europe/Berlin
      </Text>
    </View>
  );
}
function BasePage({
  input,
  landscape = false,
  children,
  table = false,
  label,
}: {
  input: ExportInput;
  landscape?: boolean;
  children: React.ReactNode;
  table?: boolean;
  label?: string;
}) {
  const layout = headerLayout(input, label, landscape);
  return (
    <Page
      size="A4"
      orientation={landscape ? "landscape" : "portrait"}
      style={{ ...styles.page, paddingTop: layout.bodyTop + (table ? 33 : 0) }}
      wrap
    >
      <Header layout={layout} />
      {children}
      <Footer landscape={landscape} />
    </Page>
  );
}

function splitCell(text: string, maxChars: number): string[] {
  if (!text) return [""];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const boundary = Math.max(
      remaining.lastIndexOf(" ", maxChars),
      remaining.lastIndexOf("\n", maxChars),
    );
    const cut = boundary > maxChars / 2 ? boundary : maxChars;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  parts.push(remaining);
  return parts;
}
function tablePages(
  rows: ExportRow[],
  columns: Column[],
  landscape: boolean,
  headerTop = 122,
): ExportRow[][] {
  const width = columns.reduce((sum, col) => sum + col.width, 0),
    availableWidth = landscape ? 778 : 531;
  const pages: ExportRow[][] = [[]];
  let height = 0;
  for (const row of rows) {
    const capacities = columns.map((col) =>
      Math.max(8, Math.floor(((availableWidth * col.width) / width - 14) / 5.4)),
    );
    const cells = columns.map((col, i) => {
      const lines = cellText(row, col)
        .split("\n")
        .flatMap((line) => splitCell(line, capacities[i]));
      return Array.from({ length: Math.max(1, Math.ceil(lines.length / 7)) }, (_, offset) =>
        lines.slice(offset * 7, offset * 7 + 7).join("\n"),
      );
    });
    for (let segment = 0; segment < Math.max(...cells.map((c) => c.length)); segment++) {
      const texts = columns.map((col, i) => cells[i][segment] ?? (i === 0 ? "Fortsetzung" : ""));
      const lines = Math.max(
        ...texts.map((text, i) =>
          text
            .split("\n")
            .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / capacities[i])), 0),
        ),
      );
      const rowHeight = 20 + lines * 14;
      if (
        height + rowHeight > (landscape ? 360 : 620) - (headerTop - 122) &&
        pages[pages.length - 1].length
      ) {
        pages.push([]);
        height = 0;
      }
      const values = Object.fromEntries(columns.map((col, i) => [col.key, texts[i]]));
      pages[pages.length - 1].push({ ...row, id: `${row.id}-${segment}`, values });
      height += rowHeight;
    }
  }
  return pages;
}
function Table({
  input,
  columns = columnsFor(input.kind, input),
  rows = exportRows(input),
  headerTop = 122,
}: {
  input: ExportInput;
  columns?: Column[];
  rows?: ExportRow[];
  headerTop?: number;
}) {
  const width = columns.reduce((sum, col) => sum + col.width, 0);
  return (
    <>
      <View fixed style={{ ...styles.tableHeader, top: headerTop }}>
        {columns.map((col) => (
          <Text key={col.key} style={{ ...styles.th, width: `${(col.width / width) * 100}%` }}>
            {col.label}
          </Text>
        ))}
      </View>
      {!rows.length && <Text style={styles.note}>Keine Einträge im gewählten Zeitraum.</Text>}
      {rows.flatMap((row, i) => {
        // A very tall cell is split into clearly marked continuation rows instead of falling off a page.
        const cells = columns.map((col) => [readable(row.values[col.key])]);
        const count = Math.max(...cells.map((cell) => cell.length));
        return Array.from({ length: count }, (_, segment) => (
          <View
            key={`${row.id}-${segment}`}
            wrap={false}
            style={{ ...styles.tr, backgroundColor: i % 2 ? colors.paper : "white" }}
          >
            {columns.map((col, c) => (
              <Text key={col.key} style={{ ...styles.td, width: `${(col.width / width) * 100}%` }}>
                {cells[c][segment] ?? (c === 0 ? "↳ Fortsetzung" : "")}
              </Text>
            ))}
          </View>
        ));
      })}
    </>
  );
}
const dayRecords = (input: ExportInput, day: string) =>
  input.records.filter((r) => {
    const start = new Date(String(r.data.start)),
      end = new Date(String(r.data.end));
    return localDay(start) <= day && localDay(new Date(+end - 1)) >= day;
  });
const previewTitle = (row: ExportRow, limit = 46) => {
  const title = String(row.values.title);
  return title.length > limit ? `${title.slice(0, limit - 1)}…` : title;
};
const weekdays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
function CalendarPreview({ input }: { input: ExportInput }) {
  if (["team", "team-month"].includes(input.view ?? ""))
    return <TeamCalendarPdf input={input} Page={BasePage} />;
  const range = calendarRange(input),
    rows = exportRows(input),
    lookup = new Map(rows.map((row) => [row.id, row]));
  const pages: React.ReactNode[] = [];
  if (input.view === "month") {
    for (
      let month = startOfMonth(parseISO(range.from));
      month <= parseISO(range.to);
      month = addMonths(month, 1)
    ) {
      const first = startOfWeek(month, { weekStartsOn: 1 });
      const weeks = Math.ceil((+endOfMonth(month) - +first + 86400000) / (7 * 86400000));
      pages.push(
        <BasePage
          key={format(month, "yyyy-MM")}
          landscape
          input={input}
          label={format(month, "MMMM yyyy", { locale: de })}
        >
          <View style={styles.gridHead}>
            {weekdays.map((day) => (
              <Text key={day} style={{ ...styles.th, width: "14.2857%" }}>
                {day}
              </Text>
            ))}
          </View>
          {Array.from({ length: weeks }, (_, week) => (
            <View key={week} style={styles.gridRow} wrap={false}>
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const date = addDays(first, week * 7 + dayIndex),
                  day = format(date, "yyyy-MM-dd"),
                  records = day >= range.from && day <= range.to ? dayRecords(input, day) : [];
                return (
                  <View
                    key={day}
                    style={{
                      ...styles.gridCell,
                      height: weeks === 6 ? 59 : 70,
                      backgroundColor:
                        date.getMonth() === month.getMonth() ? "white" : colors.paper,
                    }}
                  >
                    <Text style={styles.dayLabel}>{format(date, "dd.MM.")}</Text>
                    {records.slice(0, 1).map((record) => (
                      <Text key={record.id} style={styles.event}>
                        {eventTimeLabel(record, input).split(" – ")[0]}{" "}
                        {previewTitle(lookup.get(record.id)!, 16)}
                      </Text>
                    ))}
                    {records.length > 1 && (
                      <Text style={styles.extra}>+ {records.length - 1} · Agenda</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
          <Text style={styles.note}>
            Übersicht mit gekürzten Titeln. Alle Termine, Zeiten, Personen und Details stehen
            vollständig in der folgenden Agenda.
          </Text>
        </BasePage>,
      );
    }
  } else if (input.view === "week") {
    for (
      let week = startOfWeek(parseISO(range.from), { weekStartsOn: 1 });
      week <= parseISO(range.to);
      week = addDays(week, 7)
    ) {
      const days = Array.from({ length: 7 }, (_, i) => format(addDays(week, i), "yyyy-MM-dd"));
      pages.push(
        <BasePage
          landscape
          input={input}
          key={days[0]}
          label={`Wochenplanung · KW ${format(week, "II")}`}
        >
          <View style={styles.gridHead}>
            {days.map((day, i) => (
              <Text style={{ ...styles.th, width: "14.2857%" }} key={day}>
                {weekdays[i]} {format(parseISO(day), "dd.MM.")}
              </Text>
            ))}
          </View>
          <View style={styles.gridRow} wrap={false}>
            {days.map((day) => {
              const events = day >= range.from && day <= range.to ? dayRecords(input, day) : [];
              return (
                <View key={day} style={{ ...styles.gridCell, height: 340 }}>
                  {events.slice(0, 4).map((r) => (
                    <View key={r.id} style={{ marginBottom: 10 }}>
                      <Text style={styles.dayLabel}>{eventTimeLabel(r, input)}</Text>
                      <Text style={{ ...styles.event, fontSize: 9 }}>
                        {previewTitle(lookup.get(r.id)!)}
                      </Text>
                    </View>
                  ))}
                  {events.length > 4 && (
                    <Text style={styles.extra}>+ {events.length - 4} weitere · siehe Agenda</Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.note}>
            Gekürzte Wochenübersicht. Die folgende Agenda enthält sämtliche Einträge und ihre
            vollständigen Details.
          </Text>
        </BasePage>,
      );
    }
  }
  return <>{pages}</>;
}
function RecordImages({ input, record }: { input: ExportInput; record: ExportRow["record"] }) {
  const names = new Map(
    (input.references?.files ?? []).map((file) => [file.id, readable(file.data.name)]),
  );
  return (
    <>
      {(Array.isArray(record.data.imageIds) ? record.data.imageIds : []).map((id, i) => (
        <View key={String(id)} wrap={false} style={{ marginBottom: 20 }}>
          <Text style={styles.fieldLabel}>
            BILD {i + 1} · {names.get(String(id)) || "Dokumentation"}
          </Text>
          {input.images?.[String(id)] ? (
            <PdfImage
              style={styles.image}
              src={{
                data: Buffer.from(input.images[String(id)]),
                format: input.images[String(id)][0] === 137 ? "png" : "jpg",
              }}
            />
          ) : (
            <Text style={styles.note}>
              Bild konnte nicht bereitgestellt werden. Bitte die Originaldatei in der Galerie
              prüfen.
            </Text>
          )}
        </View>
      ))}
    </>
  );
}
function GalleryPages({ input }: { input: ExportInput }) {
  const rows = exportRows(input).filter(
    (row) => Array.isArray(row.record.data.imageIds) && row.record.data.imageIds.length,
  );
  return (
    <>
      {rows.map((row) => (
        <BasePage
          key={`gallery-${row.id}`}
          input={input}
          label={`${titles[input.kind] ?? "Dokumentation"} · Galerie`}
        >
          <View style={{ ...styles.summary, marginTop: 0, marginBottom: 20 }}>
            <Text>
              {input.kind === "casting"
                ? `${readable(row.values.character)} · ${readable(row.values.actor)}`
                : readable(row.values.title)}
            </Text>
            <Text style={{ fontSize: 9, fontWeight: 400, marginTop: 4 }}>
              {readable(row.values.production)} · Stand: {dateText(row.record.updatedAt, true)}
            </Text>
          </View>
          {readable(row.values.description) && (
            <Text style={{ ...styles.fieldText, marginBottom: 20 }}>
              {readable(row.values.description)}
            </Text>
          )}
          <RecordImages input={input} record={row.record} />
        </BasePage>
      ))}
    </>
  );
}
function AttendanceSummary({ input, rows }: { input: ExportInput; rows: ExportRow[] }) {
  const summary = durationSummary(rows);
  const groups = [
    { title: "Personensummen", entries: summary.people },
    { title: "Tagessummen", entries: summary.days },
    { title: "Wochensummen", entries: summary.weeks },
  ];
  return (
    <>
      {groups.flatMap((group) =>
        Array.from({ length: Math.max(1, Math.ceil(group.entries.length / 16)) }, (_, page) => (
          <BasePage
            input={input}
            key={`${group.title}-${page}`}
            label={`Anwesenheit · ${group.title}`}
          >
            <View style={{ ...styles.summary, marginTop: 0, marginBottom: 15 }}>
              <Text>Gesamtanwesenheit: {durationText(summary.total)}</Text>
            </View>
            {[...group.entries].slice(page * 16, page * 16 + 16).map(([label, seconds]) => (
              <View key={label} wrap={false} style={{ ...styles.tr, paddingVertical: 9 }}>
                <Text style={{ width: "78%", paddingRight: 10 }}>{label}</Text>
                <Text style={{ width: "22%", textAlign: "right", fontWeight: 700 }}>
                  {durationText(seconds)}
                </Text>
              </View>
            ))}
            {!group.entries.length && (
              <Text style={styles.note}>Keine Anwesenheit im gewählten Zeitraum.</Text>
            )}
          </BasePage>
        )),
      )}
    </>
  );
}
export async function buildPdf(input: ExportInput): Promise<Uint8Array> {
  await prepareFonts();
  if (["looks", "handovers", "characters", "casting"].includes(input.kind) && input.images) {
    const normalizedImages: Record<string, Uint8Array> = {};
    const ids = [
      ...new Set(
        input.records.flatMap((record) =>
          Array.isArray(record.data.imageIds)
            ? record.data.imageIds.filter((id): id is string => typeof id === "string")
            : [],
        ),
      ),
    ];
    // Private blobs are already fetched by the caller; normalize WEBP and EXIF locally for the PDF renderer.
    for (const id of ids)
      if (input.images[id])
        normalizedImages[id] = new Uint8Array(
          await sharp(input.images[id], { limitInputPixels: 40000000 })
            .rotate()
            .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 90 })
            .toBuffer(),
        );
    input = { ...input, images: normalizedImages };
  }
  const calendar = input.kind === "events" || input.kind === "calendar";
  const rows = exportRows(input);
  const agendaColumns = [
    ...columnsFor("events"),
    { key: "description", label: "Hinweise", width: 30 },
  ];
  const landscape = !(calendar && ["day", "agenda"].includes(input.view ?? "agenda"));
  const columns = calendar ? agendaColumns : columnsFor(input.kind, input);
  const headerTop = headerLayout(
    input,
    calendar ? "Vollständige Kalenderagenda" : undefined,
    landscape,
  ).bodyTop;
  const paginatedRows = tablePages(rows, columns, landscape, headerTop);
  const document = (
    <Document
      title={exportTitle(input)}
      author="DigitalMask"
      subject={`${input.organization} · ${input.department}`}
      language="de-DE"
    >
      {["looks", "handovers"].includes(input.kind) ? (
        <DocumentPages input={input} Page={BasePage} Images={RecordImages} />
      ) : input.kind === "productions" ? (
        <ProductionPages input={input} Page={BasePage} />
      ) : input.kind === "maskPlans" ? (
        <MaskPlanPages
          input={input}
          Page={BasePage}
          availableHeight={(label) => 542 - headerLayout(input, label, true).bodyTop}
          wrapLines={headerLines}
        />
      ) : (
        <>
          {calendar && <CalendarPreview input={input} />}
          {paginatedRows.map((pageRows, i) => (
            <BasePage
              key={i}
              input={input}
              table
              landscape={landscape}
              label={calendar ? "Vollständige Kalenderagenda" : undefined}
            >
              <Table input={input} columns={columns} rows={pageRows} headerTop={headerTop} />
            </BasePage>
          ))}
          {["characters", "casting"].includes(input.kind) && <GalleryPages input={input} />}
          {calendar && <CalendarLegendPdf input={input} Page={BasePage} />}
          {input.kind === "attendance" && <AttendanceSummary input={input} rows={rows} />}
          {["time", "attendance"].includes(input.kind) && (
            <TimeWeeklyPdf input={input} Page={BasePage} />
          )}
          {input.kind === "time" && (
            <BasePage input={input} label="Arbeitszeit · Zusammenfassung">
              <View style={styles.summary}>
                <Text>
                  Gesamtarbeitszeit:{" "}
                  {durationText(rows.reduce((sum, row) => sum + durationSeconds(row.record), 0))}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: 400, marginTop: 4 }}>
                  Produktionszeit:{" "}
                  {durationText(
                    rows
                      .filter((row) => row.record.data.productionId)
                      .reduce((sum, row) => sum + durationSeconds(row.record), 0),
                  )}{" "}
                  · Allgemeine Arbeit:{" "}
                  {durationText(
                    rows
                      .filter((row) => !row.record.data.productionId)
                      .reduce((sum, row) => sum + durationSeconds(row.record), 0),
                  )}
                </Text>
              </View>
              {input.members.map((member) => {
                const seconds = rows
                  .filter((row) => row.record.data.userId === member.id)
                  .reduce((sum, row) => sum + durationSeconds(row.record), 0);
                return seconds ? (
                  <Text key={member.id} style={{ marginTop: 12 }}>
                    {member.name}: {durationText(seconds)}
                  </Text>
                ) : null;
              })}
            </BasePage>
          )}
        </>
      )}
    </Document>
  );
  return addPageNumbers(new Uint8Array(await renderToBuffer(document)));
}
