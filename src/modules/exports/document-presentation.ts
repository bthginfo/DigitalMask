import {
  documentSectionDefaults,
  documentSections,
  lookTitle,
  pieceDuration,
  sectionName,
} from "../../shared/document-sections";
import { textValue, type DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

export function referenceName(
  id: unknown,
  fallback: unknown,
  records: DomainRecord[] = [],
  unavailable = "Nicht angegeben",
): string {
  return (
    textValue(records.find((record) => record.id === id)?.data.name) ||
    textValue(fallback) ||
    unavailable
  );
}
export function documentSectionKeys(kind: "looks" | "handovers", input?: ExportInput): string[] {
  const categories = input?.references?.categories ?? [];
  const defaults: string[] = documentSectionDefaults[kind].map((section) => section.key);
  const authoritative = input?.references?.categories !== undefined;
  const keys = [
    ...new Set<string>([
      ...(authoritative ? [] : defaults),
      ...categories
        .filter((category) => category.data.scope === kind)
        .map((category) => textValue(category.data.key)),
      ...(input?.records ?? [])
        .filter((record) => record.kind === kind)
        .flatMap((record) =>
          documentSections(record.data, kind)
            .filter(
              (section) =>
                !authoritative || Array.isArray(record.data.sections) || section.entries.length,
            )
            .map((section) => section.key),
        ),
    ]),
  ].filter(Boolean);
  const order = (key: string) => {
    const category = categories.find(
      (category) => category.data.scope === kind && category.data.key === key,
    );
    return typeof category?.data.order === "number"
      ? category.data.order
      : defaults.indexOf(key) >= 0
        ? defaults.indexOf(key)
        : 1000;
  };
  return keys.sort((a, b) => order(a) - order(b));
}
export function documentPresentation(record: DomainRecord, input: ExportInput) {
  const kind = record.kind === "handovers" ? "handovers" : "looks";
  const sections = documentSections(record.data, kind);
  const categories = input.references?.categories ?? [];
  const historicalNotes: string[] = [];
  if (kind === "looks") {
    if (textValue(record.data.scene))
      historicalNotes.push(`Frühere Szenenangabe: ${textValue(record.data.scene)}`);
    if (typeof record.data.durationMinutes === "number" && record.data.durationMinutes > 0)
      historicalNotes.push(`Früherer Zeitbedarf: ${record.data.durationMinutes} min`);
    if (record.data.templateVersion)
      historicalNotes.push(`Vorlagenhistorie: Version ${record.data.templateVersion}`);
  }
  const actor = referenceName(record.data.actorId, record.data.actorName, input.references?.actors);
  const character = referenceName(
    record.data.characterId,
    record.data.characterName,
    input.references?.characters,
  );
  const production =
    textValue(
      input.references?.productions?.find(
        (production) => production.id === record.data.productionId,
      )?.data.title,
    ) ||
    textValue(record.data.productionName) ||
    "Nicht angegeben";
  return {
    title:
      kind === "looks"
        ? lookTitle(record.data, input.references?.actors)
        : textValue(record.data.title) || "Allgemeine Übergabe",
    actor,
    character,
    production,
    productionDurationMinutes:
      kind === "looks" ? pieceDuration(record.data, input.references?.productions) : undefined,
    sections: documentSectionKeys(kind, input).map((key) => ({
      key,
      name: sectionName(key, kind, categories),
      entries: sections
        .filter((section) => section.key === key)
        .flatMap((section) => section.entries),
    })),
    checklist: Array.isArray(record.data.checklist)
      ? record.data.checklist
          .filter((item) => typeof item === "object" && item !== null && "text" in item)
          .map((item) => ({ text: textValue(item.text), done: item.done === true }))
      : [],
    historicalNotes,
    extraNotes: kind === "looks" ? textValue(record.data.notes) : "",
  };
}
export function sectionText(entries: { label?: string; text: string }[]): string {
  return entries.map((entry) => [entry.label, entry.text].filter(Boolean).join("\n")).join("\n\n");
}
