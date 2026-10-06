import { textValue, type DomainRecord } from "./contracts";

/** Upcoming premieres, then recent past premieres, then productions without a date. */
export function sortProductionsByPremiere(records: DomainRecord[], today: string) {
  const rank = (date: string) => (!date ? 2 : date >= today ? 0 : 1);
  return [...records].sort((a, b) => {
    const left = textValue(a.data.premiere),
      right = textValue(b.data.premiere);
    return (
      rank(left) - rank(right) ||
      (rank(left) === 1 ? right.localeCompare(left) : left.localeCompare(right)) ||
      textValue(a.data.title).localeCompare(textValue(b.data.title), "de") ||
      a.id.localeCompare(b.id)
    );
  });
}
