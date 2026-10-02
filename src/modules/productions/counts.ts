import { textValue, type DomainRecord } from "@/shared/contracts";
import { personNameKey } from "@/shared/person-identity";

/** Text-only roles are real figures too; alternate casting must not double-count them. */
export function productionCastingCounts(
  productionId: string,
  characters: DomainRecord[],
  casting: DomainRecord[],
) {
  const figures = characters.filter((row) => row.data.productionId === productionId);
  const assignments = casting.filter((row) => row.data.productionId === productionId);
  const keys = new Set(figures.map((row) => `id:${row.id}`));
  const names = new Map(figures.map((row) => [personNameKey(row.data.name), row.id]));
  for (const row of assignments) {
    const characterId = textValue(row.data.characterId);
    const name = personNameKey(row.data.characterName);
    if (characterId) keys.add(`id:${characterId}`);
    else if (name) keys.add(names.has(name) ? `id:${names.get(name)}` : `name:${name}`);
  }
  return { characters: keys.size, casting: assignments.length };
}
