import { textValue, type DomainRecord } from "./contracts";
import { backstageChangesSection, documentSections, lookTitle } from "./document-sections";

export function backstageChangesFilename(title: string) {
  const name = Array.from(
    title
      .replace(/\s+/g, " ")
      .replace(/[<>:"/\\|?*]/g, "-")
      .trim(),
  )
    .slice(0, 120)
    .join("");
  return name ? `Umzüge – ${name}.pdf` : "Umzüge.pdf";
}

/** Project the authorized looks into the same order for the stage list and its printout. */
export function productionBackstageChanges({
  productionId,
  looks,
  actors = [],
  characters = [],
}: {
  productionId: string;
  looks: DomainRecord[];
  actors?: DomainRecord[];
  characters?: DomainRecord[];
}) {
  if (!productionId) return [];
  return looks
    .filter((record) => record.kind === "looks" && record.data.productionId === productionId)
    .map((record) => {
      const entries = documentSections(record.data, "looks")
        .filter((section) => section.key === backstageChangesSection.key)
        .flatMap((section) => section.entries)
        .filter((entry) => entry.label?.trim() || entry.text.trim());
      return {
        record,
        actor: lookTitle(record.data, actors),
        figure:
          textValue(characters.find((row) => row.id === record.data.characterId)?.data.name) ||
          textValue(record.data.characterName),
        entries,
      };
    })
    .sort((a, b) => a.actor.localeCompare(b.actor, "de") || a.figure.localeCompare(b.figure, "de"));
}
