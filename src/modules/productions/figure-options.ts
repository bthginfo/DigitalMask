import { textValue, type DomainRecord } from "@/shared/contracts";
import { personNameKey } from "@/shared/person-identity";

export type FigureOption = { key: string; name: string; id?: string };

export function productionFigureOptions(
  productionId: string,
  characters: DomainRecord[],
  casting: DomainRecord[],
): FigureOption[] {
  if (!productionId) return [];

  const assignments = casting.filter((row) => row.data.productionId === productionId);
  const assignedIds = new Set(assignments.map((row) => textValue(row.data.characterId)));
  const options: FigureOption[] = characters
    .filter(
      (row) =>
        (row.data.productionId === productionId ||
          (!row.data.productionId && assignedIds.has(row.id))) &&
        textValue(row.data.name).trim(),
    )
    .map((row) => ({ key: row.id, id: row.id, name: textValue(row.data.name).trim() }));
  const linkedIds = new Set(options.map((option) => option.id));
  const names = new Set(options.map((option) => personNameKey(option.name)));

  for (const row of assignments) {
    if (linkedIds.has(textValue(row.data.characterId))) continue;
    const name = textValue(row.data.characterName).trim();
    const key = personNameKey(name);
    if (!key || names.has(key)) continue;
    options.push({ key: `name:${key}`, name });
    names.add(key);
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, "de"));
}
