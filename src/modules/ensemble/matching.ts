import { type RecordData, textValue } from "@/shared/contracts";
import type { EnsemblePerson } from "./source";
export const actorNameKey = (value: unknown) =>
  textValue(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function matchActor<T extends { id: string; data: RecordData }>(
  person: EnsemblePerson,
  actors: T[],
) {
  const matches = actors.filter(
    (actor) =>
      actor.data.sourceId === person.sourceId ||
      actor.data.sourceUrl === person.sourceUrl ||
      actorNameKey(actor.data.name) === actorNameKey(person.name),
  );
  return matches.length > 1
    ? { action: "conflict" as const }
    : matches.length
      ? { action: "update" as const, actor: matches[0] }
      : { action: "create" as const };
}
export function importedActorData(person: EnsemblePerson, existing: RecordData = {}): RecordData {
  return {
    ...existing,
    name: person.name,
    biography: "",
    ensembleStatus: person.ensembleStatus,
    ensembleProductions: [],
    sourceId: person.sourceId,
    sourceUrl: person.sourceUrl,
  };
}
