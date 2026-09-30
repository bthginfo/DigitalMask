import type { RecordKind } from "@/shared/contracts";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "date"
    | "datetime-local"
    | "number"
    | "select"
    | "multi"
    | "checkbox"
    | "checklist"
    | "lines"
    | "color";
  required?: boolean;
  options?: [string, string][];
  source?: RecordKind | "members";
  placeholder?: string;
  min?: number;
};
export const labels: Record<RecordKind, [string, string]> = {
  productions: ["Produktionen", "Produktion"],
  actors: ["Schauspieler", "Schauspieler"],
  characters: ["Figuren", "Figur"],
  casting: ["Besetzung", "Besetzung"],
  sprints: ["Sprints", "Sprint"],
  tasks: ["Aufgaben", "Aufgabe"],
  events: ["Kalender", "Termin"],
  leave: ["Freiwünsche", "Freiwunsch"],
  time: ["Zeitbuchungen", "Zeitbuchung"],
  looks: ["Aufschriebe", "Aufschrieb"],
  templates: ["Vorlagen", "Vorlage"],
  messages: ["Nachrichten", "Nachricht"],
  materials: ["Fundus", "Material"],
  handovers: ["Übergaben", "Übergabe"],
  notifications: ["Mitteilungen", "Mitteilung"],
  timesheets: ["Wochenabschlüsse", "Wochenabschluss"],
  files: ["Dateien", "Datei"],
  feedback: ["Feedback", "Rückmeldung"],
  attendance: ["Anwesenheit", "Anwesenheitsbuchung"],
  calendarCategories: ["Kalenderarten", "Kalenderart"],
  conversations: ["Gespräche", "Gespräch"],
  people: ["Weitere Personen", "Person"],
  categories: ["Kategorien", "Kategorie"],
};
const production: Field = {
  key: "productionId",
  label: "Produktion",
  type: "select",
  source: "productions",
};
const figure: Field = { key: "characterId", label: "Figur", type: "select", source: "characters" };
const checklist: Field = {
  key: "checklist",
  label: "Checkliste",
  type: "checklist",
  placeholder: "Ein Punkt pro Zeile",
};
const title: Field = { key: "title", label: "Titel", required: true };
const description: Field = { key: "description", label: "Beschreibung", type: "textarea" };
export const fields: Partial<Record<RecordKind, Field[]>> = {
  productions: [
    title,
    description,
    { key: "season", label: "Spielzeit", placeholder: "2026 / 2027" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        ["preparation", "In Vorbereitung"],
        ["active", "Aktiv"],
        ["archived", "Archiviert"],
      ],
    },
    { key: "premiere", label: "Premiere", type: "date" },
    { key: "durationMinutes", label: "Stückdauer in Minuten", type: "number", min: 0 },
    { key: "color", label: "Produktionsfarbe", type: "color" },
    { key: "memberIds", label: "Projektteam", type: "multi", source: "members" },
  ],
  actors: [
    { key: "name", label: "Name", required: true },
    { key: "contact", label: "Kontakt", placeholder: "Telefon oder E-Mail" },
    { key: "hair", label: "Haare / Haarfarbe", type: "textarea" },
    { key: "wigSize", label: "Perückenmaß / Kopfumfang", placeholder: "z. B. 56 cm" },
    { key: "notes", label: "Wichtige Hinweise", type: "textarea" },
  ],
  characters: [
    { key: "name", label: "Figurenname", required: true },
    { ...production, required: true },
    description,
  ],
  casting: [
    { ...production, required: true },
    { ...figure, required: true },
    { key: "actorId", label: "Schauspieler", type: "select", source: "actors", required: true },
    { key: "alternate", label: "Alternierende Besetzung", type: "checkbox" },
  ],
  sprints: [
    title,
    { ...production, required: true },
    { key: "goal", label: "Sprintziel", type: "textarea" },
    { key: "start", label: "Start", type: "date", required: true },
    { key: "end", label: "Ende", type: "date", required: true },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        ["planned", "Geplant"],
        ["active", "Aktiv"],
        ["completed", "Abgeschlossen"],
      ],
    },
  ],
  tasks: [
    title,
    description,
    production,
    { key: "sprintId", label: "Sprint", type: "select", source: "sprints" },
    { key: "parentId", label: "Übergeordnete Aufgabe", type: "select", source: "tasks" },
    { key: "assigneeIds", label: "Verantwortliche", type: "multi", source: "members" },
    {
      key: "status",
      label: "Spalte",
      type: "select",
      options: [
        ["backlog", "Backlog"],
        ["todo", "Offen"],
        ["doing", "In Arbeit"],
        ["review", "Prüfung"],
        ["done", "Erledigt"],
      ],
    },
    {
      key: "priority",
      label: "Priorität",
      type: "select",
      options: [
        ["low", "Niedrig"],
        ["normal", "Normal"],
        ["high", "Hoch"],
      ],
    },
    { key: "due", label: "Fällig am", type: "date" },
    checklist,
  ],
  events: [
    title,
    { key: "start", label: "Beginn", type: "datetime-local", required: true },
    { key: "end", label: "Ende", type: "datetime-local", required: true },
    {
      key: "category",
      label: "Kategorie",
      type: "select",
      options: [
        ["service", "Dienst"],
        ["rehearsal", "Probe"],
        ["performance", "Vorstellung"],
        ["preparation", "Vorbereitung"],
        ["absence", "Abwesenheit"],
      ],
    },
    production,
    { key: "participantIds", label: "Personen", type: "multi", source: "members" },
    { key: "location", label: "Ort" },
    {
      key: "recurrence",
      label: "Wiederholung",
      type: "select",
      options: [
        ["none", "Keine"],
        ["daily", "Täglich"],
        ["weekly", "Wöchentlich"],
      ],
    },
    { key: "until", label: "Wiederholen bis", type: "date" },
    {
      key: "exceptions",
      label: "Ausnahmen (Datum je Zeile)",
      type: "lines",
      placeholder: "2026-12-24",
    },
  ],
  leave: [
    { key: "start", label: "Von", type: "date", required: true },
    { key: "end", label: "Bis", type: "date", required: true },
    { key: "reason", label: "Grund / Nachricht", type: "textarea" },
  ],
  time: [
    title,
    production,
    { key: "taskId", label: "Aufgabe", type: "select", source: "tasks" },
    {
      key: "category",
      label: "Tätigkeit",
      type: "select",
      options: [
        ["production", "Produktionsarbeit"],
        ["office", "Büro"],
        ["cleaning", "Aufräumen"],
        ["other", "Allgemeine Arbeit"],
      ],
    },
    { key: "date", label: "Datum", type: "date", required: true },
    { key: "start", label: "Beginn (optional)", type: "datetime-local" },
    { key: "end", label: "Ende (optional)", type: "datetime-local" },
    { key: "durationSeconds", label: "Dauer in Minuten", type: "number", required: true, min: 1 },
    { key: "pauseSeconds", label: "Pause in Minuten", type: "number", min: 0 },
  ],
  looks: [
    production,
    { key: "actorId", label: "Schauspielperson", source: "actors", type: "select" },
    { key: "actorName", label: "Schauspielname" },
    figure,
    { key: "characterName", label: "Figurenname" },
    { key: "productionDurationMinutes", label: "Stückdauer in Minuten", type: "number" },
    { key: "templateId", label: "Vorlage", source: "templates", type: "select" },
  ],
  templates: [
    title,
    {
      key: "fields",
      label: "Felder (ein Feld pro Zeile)",
      type: "lines",
      required: true,
      placeholder: "Vorbereitung\nMaterial\nArbeitsablauf\nUmbau",
    },
    { key: "version", label: "Vorlagenversion", type: "number", min: 1, required: true },
  ],
  materials: [
    { key: "name", label: "Bezeichnung", required: true },
    {
      key: "category",
      label: "Kategorie",
      type: "select",
      options: [
        ["wig", "Perücke"],
        ["makeup", "Make-up"],
        ["tool", "Werkzeug"],
        ["other", "Sonstiges"],
      ],
    },
    { key: "location", label: "Lagerort", required: true },
    { key: "quantity", label: "Bestand", type: "number", min: 0, required: true },
    { key: "minQuantity", label: "Mindestbestand", type: "number", min: 0 },
    figure,
    { key: "notes", label: "Hinweise", type: "textarea" },
  ],
  handovers: [title, checklist],
  people: [
    { key: "name", label: "Name", required: true },
    { key: "organization", label: "Organisation" },
    { key: "position", label: "Funktion" },
    { key: "email", label: "E-Mail" },
    { key: "phone", label: "Telefon" },
    { key: "notes", label: "Hinweise", type: "textarea" },
  ],
  attendance: [
    { key: "title", label: "Bezeichnung" },
    { key: "start", label: "Beginn", type: "datetime-local" },
    { key: "end", label: "Ende", type: "datetime-local" },
    { key: "durationSeconds", label: "Anwesenheit ohne Pause", type: "number" },
    { key: "pauseSeconds", label: "Pause", type: "number" },
    { key: "notes", label: "Notiz", type: "textarea" },
  ],
};
export const statusLabels: Record<string, string> = {
  preparation: "Vorbereitung",
  active: "Aktiv",
  archived: "Archiviert",
  backlog: "Backlog",
  todo: "Offen",
  doing: "In Arbeit",
  review: "Prüfung",
  done: "Erledigt",
  planned: "Geplant",
  completed: "Abgeschlossen",
  pending: "Wartet auf Freigabe",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
  submitted: "Eingereicht",
  changes_requested: "Korrektur angefragt",
  draft: "Entwurf",
  published: "Veröffentlicht",
  service: "Dienst",
  rehearsal: "Probe",
  performance: "Vorstellung",
  absence: "Abwesenheit",
  production: "Produktion",
  office: "Büro",
  cleaning: "Aufräumen",
  other: "Allgemein",
  open: "Offen",
  complete: "Abgeschlossen",
  wig: "Perücke",
  makeup: "Make-up",
  tool: "Werkzeug",
};
