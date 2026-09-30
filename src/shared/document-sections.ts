import { textValue, numberValue, type DomainRecord, type RecordData } from "./contracts";

export interface TextEntry {
  id: string;
  label?: string;
  text: string;
}
export interface TextSection {
  key: string;
  entries: TextEntry[];
}
export const documentSectionDefaults = {
  looks: [
    { key: "preparation", name: "Vorbereitung" },
    { key: "makeup", name: "Makeup" },
    { key: "hair", name: "Haare" },
    { key: "wigs-beards", name: "Perücken und Bärte" },
    { key: "changeover", name: "Umbau & Wechsel" },
    { key: "setup", name: "Einrichten" },
  ],
  handovers: [
    { key: "care", name: "Worauf muss ich achten" },
    { key: "notes", name: "Allgemeine Hinweise" },
  ],
} as const;

/** Convert legacy fields in memory; reading documents never writes or queries the database. */
export function documentSections(data: RecordData, kind: "looks" | "handovers"): TextSection[] {
  if (Array.isArray(data.sections)) return data.sections as TextSection[];
  const legacy: Record<string, string[]> =
    kind === "looks"
      ? {
          preparation: [textValue(data.preparation), textValue(data.materials)],
          makeup: [textValue(data.steps)],
          hair: [],
          "wigs-beards": [],
          changeover: [textValue(data.changeover)],
          setup: [],
        }
      : { care: [], notes: [textValue(data.notes)] };
  if (kind === "looks" && data.templateFields && typeof data.templateFields === "object") {
    for (const [label, value] of Object.entries(data.templateFields)) {
      if (typeof value === "string" && value.trim()) legacy.setup.push(`${label}\n${value}`);
    }
  }
  return Object.entries(legacy).map(([key, values]) => ({
    key,
    entries: values
      .filter((value) => value.trim())
      .map((text, index) => ({ id: `legacy-${key}-${index}`, text })),
  }));
}

export function sectionName(
  key: string,
  kind: "looks" | "handovers",
  categories: DomainRecord[] = [],
) {
  const category = categories.find((row) => row.data.scope === kind && row.data.key === key);
  return (
    textValue(category?.data.name) ||
    documentSectionDefaults[kind].find((item) => item.key === key)?.name ||
    key
  );
}

export function lookTitle(data: RecordData, actors: DomainRecord[] = []) {
  const actor = actors.find((row) => row.id === data.actorId);
  return (
    textValue(actor?.data.name) ||
    textValue(data.actorName) ||
    textValue(data.title) ||
    "Allgemeiner Aufschrieb"
  );
}

export function pieceDuration(data: RecordData, productions: DomainRecord[] = []) {
  if (typeof data.productionDurationMinutes === "number") return data.productionDurationMinutes;
  return numberValue(productions.find((row) => row.id === data.productionId)?.data.durationMinutes);
}
