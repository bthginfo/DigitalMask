import { textValue, type ProductionContact, type DomainRecord, type Member } from "./contracts";

/** Current directory names win over saved snapshots; no lookup beyond cached workspace data. */
export function productionContactName(
  contact: ProductionContact,
  members: Member[] = [],
  people: DomainRecord[] = [],
) {
  return (
    (contact.memberId
      ? members.find((member) => member.id === contact.memberId)?.name
      : textValue(people.find((person) => person.id === contact.personId)?.data.name)) ||
    contact.name ||
    "Name nicht angegeben"
  );
}
