import type { DomainRecord } from "../../shared/contracts";
import type { Column, ExportInput, ExportRow } from "./types";
import { productionContactsText } from "./contacts";
import { eventDisplay } from "./calendar-presentation";
import { categoryName } from "../../shared/domain-categories";
import { sectionName } from "../../shared/document-sections";
import { actorSeasons } from "../../shared/period-filter";
import {
  documentPresentation,
  documentSectionKeys,
  referenceName,
  sectionText,
} from "./document-presentation";

export const titles: Record<string, string> = {
  events: "Dienst- und Kalenderplanung",
  calendar: "Dienst- und Kalenderplanung",
  time: "Arbeitszeitnachweis",
  attendance: "Anwesenheitsnachweis",
  timesheets: "Wochenfreigaben",
  looks: "Aufschriebe",
  materials: "Material- und Perückenbestand",
  reservations: "Artikelreservierungen",
  shiftSwaps: "Diensttausch-Anfragen",
  actors: "Schauspielerkatalog",
  people: "Kontaktverzeichnis",
  characters: "Figurenkatalog",
  casting: "Besetzungsliste",
  maskPlans: "Maskenpläne",
  tasks: "Aufgaben",
  productions: "Produktionen",
  handovers: "Dienstübergaben",
  sprints: "Sprints",
  leave: "Freiwünsche",
  templates: "Aufschriebvorlagen",
  messages: "Nachrichten",
  notifications: "Benachrichtigungen",
  files: "Dateiverzeichnis",
};
export function exportTitle(input: Pick<ExportInput, "kind" | "teamOnly">): string {
  return input.teamOnly ? "Teamboard · Aufgaben" : (titles[input.kind] ?? "Datenexport");
}
export function exportPeriod(input: Pick<ExportInput, "from" | "to" | "year" | "season">): string {
  return (
    [
      input.year ? `Jahr ${input.year}` : "",
      input.season ? `Spielzeit ${input.season}` : "",
      input.from
        ? `${dateText(input.from)}${input.to && input.to !== input.from ? ` – ${dateText(input.to)}` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Gesamter Zeitraum"
  );
}
export function value(record: DomainRecord, ...keys: string[]): unknown {
  for (const key of keys)
    if (record.data[key] !== undefined && record.data[key] !== null && record.data[key] !== "")
      return record.data[key];
  return "";
}
export function readable(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (Array.isArray(input)) return input.map(readable).filter(Boolean).join(", ");
  if (typeof input === "object")
    return Object.entries(input)
      .map(([key, val]) => `${key}: ${readable(val)}`)
      .join("; ");
  if (typeof input === "boolean") return input ? "Ja" : "Nein";
  return String(input);
}
export function dateValue(input: unknown): Date | undefined {
  if (typeof input !== "string" && typeof input !== "number" && !(input instanceof Date)) return;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
export function dateText(input: unknown, withTime = false): string {
  const date = dateValue(input);
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
export function durationSeconds(record: DomainRecord): number {
  const seconds = value(record, "seconds", "durationSeconds", "totalSeconds");
  if (typeof seconds === "number") return Math.max(0, seconds);
  const minutes = value(record, "minutes", "durationMinutes");
  if (typeof minutes === "number") return Math.max(0, minutes * 60);
  const start = dateValue(value(record, "start", "startAt", "startedAt"));
  const end = dateValue(value(record, "end", "endAt", "endedAt"));
  return start && end
    ? Math.max(
        0,
        (end.getTime() - start.getTime()) / 1000 - Number(value(record, "pauseSeconds") || 0),
      )
    : 0;
}
export function durationText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

const column = (key: string, label: string, width: number, type?: Column["type"]): Column => ({
  key,
  label,
  width,
  type,
});
export function columnsFor(kind: string, input?: ExportInput): Column[] {
  switch (kind) {
    case "reservations":
      return [
        column("title", "Artikel / Verwendung", 29),
        column("quantity", "Menge", 10),
        column("start", "Von", 20, "date"),
        column("end", "Bis", 20, "date"),
        column("person", "Reserviert von", 23),
        column("production", "Produktion", 24),
        column("actor", "Schauspielperson", 22),
        column("status", "Stand", 17),
        column("description", "Hinweise", 35),
      ];
    case "shiftSwaps":
      return [
        column("person", "Von → an", 28),
        column("title", "Dienst", 28),
        column("start", "Beginn", 20, "date"),
        column("end", "Ende", 20, "date"),
        column("counter", "Gegendienst", 35),
        column("status", "Stand", 25),
        column("description", "Nachricht", 35),
      ];
    case "events":
    case "calendar":
      return [
        column("title", "Termin / Dienst", 27),
        column("start", "Beginn", 19, "date"),
        column("end", "Ende", 19, "date"),
        column("dayLabel", "Terminart", 15),
        column("person", "Personen", 21),
        column("location", "Ort / Kategorie", 24),
      ];
    case "time":
      return [
        column("start", "Datum", 17, "date"),
        column("person", "Person", 22),
        column("production", "Produktion", 23),
        column("title", "Tätigkeit", 39),
        column("duration", "Stunden", 12, "duration"),
        column("category", "Kategorie", 24),
      ];
    case "attendance":
      return [
        column("start", "Datum", 18, "date"),
        column("person", "Person", 25),
        column("title", "Eintrag", 26),
        column("description", "Hinweise", 40),
        column("duration", "Anwesenheit", 15, "duration"),
      ];
    case "actors":
      return [
        column("title", "Name", 24),
        column("ensembleSeasons", "Spielzeiten", 24),
        column("contact", "Kontakt", 25),
        column("hair", "Haare / Perücke", 27),
        column("description", "Arbeitsnotizen", 42),
      ];
    case "people":
      return [
        column("title", "Name", 30),
        column("organization", "Organisation", 28),
        column("position", "Position", 28),
        column("email", "E-Mail", 34),
        column("phone", "Telefon", 25),
        column("description", "Hinweise", 45),
      ];
    case "casting":
      return [
        column("production", "Produktion", 26),
        column("character", "Figur", 25),
        column("actor", "Besetzung", 30),
        column("description", "Hinweise", 36),
      ];
    case "materials":
      return [
        column("title", "Material / Perücke", 30),
        column("location", "Lagerort", 22),
        column("quantity", "Bestand", 12),
        column("minimum", "Mindestbestand", 14),
        column("description", "Hinweise", 35),
        column("category", "Kategorie", 24),
      ];
    case "productions":
      return [
        column("title", "Produktion", 30),
        column("season", "Spielzeit", 17),
        column("premiere", "Premiere", 18, "date"),
        column("person", "Team", 27),
        column("status", "Status", 19),
        column("description", "Beschreibung", 42),
        column("contacts", "Zuständigkeiten / Kontakte", 55),
        column("productionDurationMinutes", "Stückdauer (min)", 20),
      ];
    case "handovers":
      return [
        column("documentDate", "Erstellt am", 18, "date"),
        column("title", "Übergabe", 30),
        ...documentSectionKeys("handovers", input).map((key) =>
          column(
            `section:${key}`,
            sectionName(key, "handovers", input?.references?.categories),
            45,
          ),
        ),
        column("checklist", "Checkliste", 45),
        column("imageIds", "Bildreferenzen", 35),
      ];
    case "tasks":
      return [
        column("title", "Aufgabe", 35),
        column("person", "Verantwortlich", 23),
        column("status", "Status", 16),
        column("start", "Fällig", 16, "date"),
        column("description", "Details / Checkliste", 35),
      ];
    case "looks":
      return [
        column("title", "Schauspieler / Aufschrieb", 30),
        column("production", "Produktion", 24),
        column("character", "Figur", 22),
        column("productionDurationMinutes", "Stückdauer (min)", 20),
        ...documentSectionKeys("looks", input).map((key) =>
          column(`section:${key}`, sectionName(key, "looks", input?.references?.categories), 45),
        ),
        column("extraNotes", "Weitere Hinweise", 40),
        column("historicalNotes", "Historische Zusatznotizen", 40),
        column("imageIds", "Bildreferenzen", 35),
      ];
    default:
      return [
        column("title", "Bezeichnung", 30),
        column("production", "Produktion / Bezug", 25),
        column("person", "Person", 22),
        column("status", "Status", 18),
        column("description", "Details", 45),
      ];
  }
}
const statuses: Record<string, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  open: "Offen",
  todo: "Offen",
  doing: "In Arbeit",
  in_progress: "In Arbeit",
  backlog: "Backlog",
  review: "In Prüfung",
  done: "Erledigt",
  complete: "Abgeschlossen",
  approved: "Genehmigt",
  pending: "Beantragt",
  rejected: "Abgelehnt",
  submitted: "Eingereicht",
  active: "Aktiv",
  archived: "Archiviert",
  preparation: "Vorbereitung",
  planned: "Geplant",
  completed: "Abgeschlossen",
  withdrawn: "Zurückgezogen",
  changes_requested: "Korrektur angefragt",
  reserved: "Reserviert",
  cancelled: "Aufgehoben",
  awaiting_partner: "Antwort ausstehend",
  awaiting_admin: "Adminfreigabe ausstehend",
  declined: "Von angefragter Person abgelehnt",
};
export function exportRows(input: ExportInput): ExportRow[] {
  const members = new Map(input.members.map((m) => [m.id, m.name]));
  const records = new Map(
    [...input.records, ...Object.values(input.references ?? {}).flatMap((r) => r ?? [])].map(
      (r) => [r.id, readable(value(r, "name", "title"))],
    ),
  );
  const name = (v: unknown) => {
    const text = readable(v);
    return members.get(text) ?? records.get(text) ?? text;
  };
  return input.records
    .filter((r) =>
      input.kind === "calendar"
        ? r.kind === "events"
        : input.kind === "backup" || r.kind === input.kind,
    )
    .map((record) => {
      const document = ["looks", "handovers"].includes(record.kind)
        ? documentPresentation(record, input)
        : undefined;
      const display = record.kind === "events" ? eventDisplay(record, input) : undefined;
      const endDate = dateValue(value(record, "end", "endAt"));
      const people = value(
        record,
        "participantIds",
        "memberIds",
        "assigneeIds",
        "assignedTo",
        "userId",
        "memberId",
        "personId",
        "authorId",
      );
      const person = Array.isArray(people) ? people.map(name).join(", ") : name(people);
      const checklist = value(record, "checklist", "items");
      const description = readable(
        value(record, "description", "notes", "body", "content", "text"),
      );
      return {
        id: record.id,
        record,
        values: {
          title:
            record.kind === "reservations"
              ? [name(record.data.materialId), readable(record.data.purpose)]
                  .filter(Boolean)
                  .join(" · ")
              : record.kind === "shiftSwaps"
                ? readable(record.data.serviceTitle)
                : (document?.title ??
                  display?.title ??
                  (readable(value(record, "title", "name", "activity", "subject", "label")) ||
                    (record.kind === "attendance" ? "Anwesenheit" : ""))),
          person:
            record.kind === "shiftSwaps"
              ? `${name(record.data.requesterId)} → ${name(record.data.partnerId)}`
              : person,
          counter:
            record.kind === "shiftSwaps" && record.data.counterServiceId
              ? `${readable(record.data.counterServiceTitle)}\n${dateText(record.data.counterServiceStart, true)} – ${dateText(record.data.counterServiceEnd, true)}`
              : "",
          production: name(value(record, "productionName", "productionId", "projectId")),
          actor: referenceName(
            record.data.actorId,
            record.data.actorName,
            input.references?.actors,
          ),
          character: referenceName(
            record.data.characterId,
            record.data.characterName,
            input.references?.characters,
          ),
          documentDate: dateValue(record.createdAt) ?? "",
          start:
            dateValue(
              value(
                record,
                "start",
                "serviceStart",
                "startAt",
                "date",
                "day",
                "due",
                "dueAt",
                "dueDate",
              ),
            ) ?? "",
          end: endDate
            ? display?.allDay
              ? new Date(+endDate - 1)
              : endDate
            : dateValue(record.data.serviceEnd) || "",
          isAllDay: display?.allDay ? 1 : 0,
          dayLabel: display?.allDay ? "Ganztägig" : "Mit Uhrzeit",
          duration: durationSeconds(record) / 86400,
          status: statuses[readable(value(record, "status"))] ?? readable(value(record, "status")),
          description: [
            description,
            record.kind === "shiftSwaps" ? readable(record.data.note) : "",
            Array.isArray(checklist)
              ? checklist
                  .map((item) =>
                    typeof item === "object" && item !== null && "text" in item
                      ? `${item.done ? "[x]" : "[ ]"} ${readable(item.text)}`
                      : readable(item),
                  )
                  .join("\n")
              : readable(checklist),
            record.kind === "casting"
              ? record.data.alternate
                ? "Alternativbesetzung"
                : "Hauptbesetzung"
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          location:
            record.kind === "events"
              ? [
                  readable(record.data.location),
                  display?.categoryName ?? readable(record.data.category),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : readable(value(record, "location", "category")),
          contact: [readable(value(record, "contact", "email")), readable(value(record, "phone"))]
            .filter(Boolean)
            .join("\n"),
          hair: [
            readable(value(record, "hair", "hairDescription")),
            readable(value(record, "wigSize", "headSize")),
          ]
            .filter(Boolean)
            .join("\n"),
          quantity: Number(value(record, "quantity", "stock") || 0),
          minimum: Number(value(record, "minQuantity", "minimum", "minStock", "minimumStock") || 0),
          scene: readable(record.data.scene),
          preparation: readable(record.data.preparation),
          materials: readable(record.data.materials),
          steps: readable(record.data.steps),
          changeover: readable(record.data.changeover),
          durationMinutes: Number(record.data.durationMinutes ?? 0),
          productionDurationMinutes:
            record.kind === "productions"
              ? Number(record.data.durationMinutes ?? 0)
              : (document?.productionDurationMinutes ?? 0),
          category: ["time", "materials"].includes(record.kind)
            ? categoryName(
                record.kind as "time" | "materials",
                readable(record.data.category) ||
                  (record.kind === "time" && record.data.productionId ? "production" : "other"),
                input.references?.categories,
              )
            : "",
          organization: readable(record.data.organization),
          position: readable(record.data.position),
          email: readable(record.data.email),
          phone: readable(record.data.phone),
          extraNotes: document?.extraNotes ?? "",
          historicalNotes: document?.historicalNotes.join("\n") ?? "",
          checklist:
            document?.checklist
              .map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`)
              .join("\n") ?? "",
          ...Object.fromEntries(
            (document?.sections ?? []).map((section) => [
              `section:${section.key}`,
              sectionText(section.entries),
            ]),
          ),
          imageIds: readable(record.data.imageIds),
          season: readable(record.data.season),
          ensembleSeasons: record.kind === "actors" ? actorSeasons(record.data).join(", ") : "",
          premiere: dateValue(record.data.premiere) ?? "",
          contacts: productionContactsText(record, input.members, input.references?.people),
        },
      };
    });
}
export function cellText(row: ExportRow, col: Column): string {
  const v = row.values[col.key];
  return col.type === "duration"
    ? durationText(Number(v) * 86400)
    : v instanceof Date
      ? dateText(
          v,
          !row.values.isAllDay &&
            col.key !== "documentDate" &&
            (col.key !== "start" ||
              ["events", "reservations", "shiftSwaps"].includes(row.record.kind)),
        )
      : readable(v);
}
