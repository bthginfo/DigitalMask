import { contactsValue, textValue, type DomainRecord, type Workspace } from "./contracts";
import { recordMatchesPeriod, type PeriodFilter } from "./period-filter";

/** Resolve only explicit IDs within the already authorised workspace. */
export function relatedProduction(record: DomainRecord, workspace: Workspace) {
  return workspace.records.productions.find(
    (production) => production.id === record.data.productionId,
  );
}

export function castingCharacter(casting: DomainRecord, workspace: Workspace) {
  return workspace.records.characters.find(
    (character) => character.id === casting.data.characterId,
  );
}

export function castingActor(casting: DomainRecord, workspace: Workspace) {
  return workspace.records.actors.find((actor) => actor.id === casting.data.actorId);
}

export function characterName(casting: DomainRecord, workspace: Workspace) {
  return (
    textValue(castingCharacter(casting, workspace)?.data.name) ||
    textValue(casting.data.characterName) ||
    "Figur noch offen"
  );
}

export function actorName(casting: DomainRecord, workspace: Workspace) {
  return (
    textValue(castingActor(casting, workspace)?.data.name) ||
    textValue(casting.data.actorName) ||
    "Besetzung noch offen"
  );
}

export function actorProductions(actorId: string, workspace: Workspace, period: PeriodFilter) {
  const productions = workspace.records.productions;
  const castings = workspace.records.casting.filter((casting) => casting.data.actorId === actorId);
  return productions
    .filter(
      (production) =>
        castings.some((casting) => casting.data.productionId === production.id) &&
        recordMatchesPeriod(production, period, productions),
    )
    .sort((a, b) => textValue(a.data.title).localeCompare(textValue(b.data.title), "de"))
    .map((production) => ({
      production,
      castings: castings.filter((casting) => casting.data.productionId === production.id),
    }));
}

export function actorLooks(actorId: string, workspace: Workspace, period: PeriodFilter) {
  return workspace.records.looks.filter(
    (look) =>
      look.data.actorId === actorId &&
      recordMatchesPeriod(look, period, workspace.records.productions),
  );
}

export function characterCastings(characterId: string, workspace: Workspace) {
  return workspace.records.casting.filter((casting) => casting.data.characterId === characterId);
}

export function personProductions(personId: string, workspace: Workspace, period: PeriodFilter) {
  return workspace.records.productions
    .filter(
      (production) =>
        contactsValue(production.data.contacts).some((contact) => contact.personId === personId) &&
        recordMatchesPeriod(production, period, workspace.records.productions),
    )
    .sort((a, b) => textValue(a.data.title).localeCompare(textValue(b.data.title), "de"))
    .map((production) => ({
      production,
      roles: [
        ...new Set(
          contactsValue(production.data.contacts)
            .filter((contact) => contact.personId === personId)
            .map((contact) => contact.role)
            .filter(Boolean),
        ),
      ],
    }));
}
