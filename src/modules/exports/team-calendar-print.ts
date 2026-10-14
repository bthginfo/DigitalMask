import { calendarEventPaint } from "../../shared/calendar-paint";
import { eventDisplay } from "./calendar-presentation";
import { eventStartTimeLabel, eventTimeLabel, memberDayEvents } from "./team-calendar";
import type { DomainRecord } from "../../shared/contracts";
import { textValue } from "../../shared/contracts";
import type { ExportInput } from "./types";

/** Complete cell entries shared by the printable PDF and Excel matrices. */
export function teamPrintEntries(input: ExportInput, day: string, memberId: string) {
  return memberDayEvents(input, day, memberId)
    .sort(
      (a, b) =>
        Number(eventDisplay(b, input).allDay) - Number(eventDisplay(a, input).allDay) ||
        String(a.data.start).localeCompare(String(b.data.start)) ||
        a.id.localeCompare(b.id),
    )
    .map((record) => calendarPrintEntry(record, input));
}

export function calendarPrintEntry(record: DomainRecord, input: ExportInput) {
  const display = eventDisplay(record, input);
  const monthlyPrint = input.view === "team-month" && ["pdf", "xlsx"].includes(input.format);
  const compact = monthlyPrint ? monthlyPrintLabel(record, input) : undefined;
  const original = /^#[0-9a-f]{6}$/i.test(display.color) ? display.color : "#77818e";
  // Absences remain lighter, but the entire printed entry carries its colour.
  const color = display.allDay
    ? `#${[1, 3, 5]
        .map((index) =>
          Math.round((parseInt(original.slice(index, index + 2), 16) + 255) / 2)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`
    : original;
  const paint = calendarEventPaint(color, false);
  return {
    id: record.id,
    allDay: display.allDay,
    title: compact?.title ?? display.title,
    time: display.allDay
      ? ""
      : compact?.performance
        ? eventStartTimeLabel(record)
        : monthlyPrint
          ? eventTimeLabel(record, input)
              .replace(/\b0(\d):/g, "$1:")
              .replace(/:00\b/g, "")
              .replace(/\s*–\s*/g, "–")
          : eventTimeLabel(record, input),
    color,
    textColor: paint.textColor,
  };
}

/** An all-day entry paints the whole person/day area underneath timed appointments. */
export function calendarPrintDayBackground(entries: ReturnType<typeof calendarPrintEntry>[]) {
  return entries.find((entry) => entry.allDay)?.color ?? "#ffffff";
}

/** Print abbreviations never rename categories, productions or stored events. */
export function monthlyPrintLabel(record: DomainRecord, input: ExportInput) {
  const display = eventDisplay(record, input);
  const normalize = (name: string) =>
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[\s._-]+/g, "");
  const names = [textValue(record.data.category), display.categoryName].map(normalize);
  const production = input.references?.productions?.find(
    (row) => row.id === record.data.productionId,
  );
  const productionTitle = textValue(production?.data.title).trim();
  const customTitle = textValue(record.data.title).trim();
  const performance = names.some((name) =>
    ["performance", "vorstellung", "vorstellungen"].includes(name),
  );
  if (performance)
    return { title: productionTitle || customTitle || display.categoryName, performance };
  const aliases = [
    { label: "HFT", names: ["halfdayoff", "halberfreiertag", "hft"] },
    { label: "TG", names: ["service", "dienst", "tagesdienst", "td", "tg"] },
    { label: "Konzi", names: ["konzeption", "conception", "konzi"] },
  ].find((alias) => names.some((name) => alias.names.includes(name)));
  const abbreviation = aliases?.label;
  if (!abbreviation) return { title: display.title, performance };
  const automaticTitle = productionTitle
    ? `${productionTitle} – ${display.categoryName}`
    : display.categoryName;
  const extra =
    customTitle &&
    ![productionTitle, automaticTitle, display.categoryName, abbreviation].includes(customTitle) &&
    !aliases?.names.includes(normalize(customTitle))
      ? ` · ${customTitle}`
      : "";
  return {
    title: `${productionTitle ? `${productionTitle} – ` : ""}${abbreviation}${extra}`,
    performance,
  };
}
