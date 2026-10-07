import type { RecordKind, Workspace } from "@/shared/contracts";
import { dateLabel, hours, value } from "@/shared/client-api";
import { fields, labels, statusLabels } from "@/components/resource-fields";
import { sectionName } from "@/shared/document-sections";
import { shiftSwapStatusLabels } from "@/modules/shift-swaps/model";

const extraLabels: Record<string, string> = {
  sections: "Aufschrieb",
  contacts: "Team & Kontakte",
  blocks: "Zeitblöcke",
  lanes: "Maskenpersonal",
  excludedDates: "Ausnahmen",
  memberIds: "Produktionsteam",
  participantIds: "Personen",
  checklist: "Checkliste",
  files: "Dateien",
  color: "Farbe",
  allDay: "Ganztägig",
  background: "Tagesdienst",
  startMinute: "Vorlauf",
  durationMinutes: "Dauer",
  actorIds: "Schauspieler",
  headCircumference: "Kopfumfang",
  text: "Text",
  title: "Bezeichnung",
  name: "Name",
  quantity: "Menge",
  purpose: "Zweck",
  status: "Status",
  requesterId: "Anfragende Person",
  partnerId: "Übernehmende Person",
  serviceId: "Abzugebender Dienst",
  serviceTitle: "Dienst",
  serviceStart: "Dienstbeginn",
  serviceEnd: "Dienstende",
  serviceVersion: "Dienststand",
  counterServiceId: "Gegendienst",
  counterServiceTitle: "Gegendienst",
  counterServiceStart: "Beginn des Gegendienstes",
  counterServiceEnd: "Ende des Gegendienstes",
  counterServiceVersion: "Stand des Gegendienstes",
  note: "Nachricht",
  requestedAt: "Angefragt am",
  partnerDecidedAt: "Antwort am",
  adminDecidedAt: "Freigabe am",
  decidedBy: "Entscheidung von",
  resultEventIds: "Übernommene Dienste",
};
export const changeFieldLabel = (kind: RecordKind, key: string) =>
  fields[kind]?.find((field) => field.key === key)?.label || extraLabels[key] || "Weitere Angaben";

function linkedName(raw: string, workspace: Workspace) {
  const member = workspace.members.find((item) => item.id === raw);
  if (member) return member.name;
  const record = Object.values(workspace.records)
    .flat()
    .find((item) => item.id === raw);
  return record
    ? value(record.data, "name") || value(record.data, "title") || labels[record.kind][1]
    : "";
}

export function readableChangeValue(
  kind: RecordKind,
  key: string,
  raw: unknown,
  workspace: Workspace,
): string {
  if (raw === null || raw === undefined || raw === "") return "Nicht eingetragen";
  if (typeof raw === "boolean") return raw ? "Ja" : "Nein";
  if (typeof raw === "number") {
    if (key === "durationSeconds") return `${hours(raw)} h`;
    if (key === "pauseSeconds") return `${Math.round(raw / 60)} min`;
    if (/Minutes$|Minute$/.test(key)) return `${raw} min`;
    return new Intl.NumberFormat("de-DE").format(raw);
  }
  if (typeof raw === "string") {
    const field = fields[kind]?.find((item) => item.key === key);
    if (field?.source || /Id$|Ids$/.test(key) || key === "decidedBy")
      return linkedName(raw, workspace) || "Nicht mehr verfügbar";
    if (
      field?.type === "date" ||
      field?.type === "datetime-local" ||
      /(?:Start|End|At)$/.test(key)
    ) {
      if (Number.isFinite(Date.parse(raw))) return dateLabel(raw, field?.type !== "date");
    }
    if (key === "status") {
      if (kind === "shiftSwaps")
        return shiftSwapStatusLabels[raw as keyof typeof shiftSwapStatusLabels] || raw;
      if (kind === "reservations") return raw === "cancelled" ? "Aufgehoben" : "Reserviert";
      return statusLabels[raw] || field?.options?.find((item) => item[0] === raw)?.[1] || raw;
    }
    if (key === "category") {
      return (
        (workspace.records.calendarCategories.find((item) => item.data.key === raw)?.data
          .name as string) ||
        (workspace.records.categories.find((item) => item.data.key === raw)?.data.name as string) ||
        raw
      );
    }
    return field?.options?.find((item) => item[0] === raw)?.[1] || raw;
  }
  if (Array.isArray(raw)) {
    if (!raw.length) return "Keine Einträge";
    return raw
      .map((item) => {
        if (!item || typeof item !== "object")
          return readableChangeValue(kind, key, item, workspace);
        const data = item as Record<string, unknown>;
        if (key === "text" && typeof data.text === "string")
          return `${typeof data.label === "string" && data.label ? `${data.label}: ` : ""}${data.text}`;
        if (key === "contacts") {
          const name =
            linkedName(String(data.memberId || data.personId || ""), workspace) ||
            String(data.name || "Person");
          return `${data.role || "Kontakt"}: ${name}`;
        }
        if (key === "checklist") return `${data.done ? "✓" : "○"} ${data.text || "Eintrag"}`;
        if (key === "sections") {
          const heading = sectionName(
            String(data.key || ""),
            kind === "handovers" ? "handovers" : "looks",
            workspace.records.categories,
          );
          return `${heading}: ${readableChangeValue(kind, "text", data.entries || data.blocks || data.fields || data.text || [], workspace)}`;
        }
        return Object.entries(data)
          .filter(([nested]) => !["id", "laneId", "type", "key"].includes(nested))
          .map(
            ([nested, content]) =>
              `${extraLabels[nested] || changeFieldLabel(kind, nested)}: ${readableChangeValue(kind, nested, content, workspace)}`,
          )
          .join(" · ");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof raw === "object")
    return (
      Object.entries(raw as Record<string, unknown>)
        .filter(([nested]) => !["id", "key"].includes(nested))
        .map(
          ([nested, content]) =>
            `${extraLabels[nested] || changeFieldLabel(kind, nested)}: ${readableChangeValue(kind, nested, content, workspace)}`,
        )
        .join("\n") || "Keine Angaben"
    );
  return "Weitere Angaben geändert";
}
