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

export function hasMakeupResponsibility(contacts: ProductionContact[], memberId: string) {
  return contacts.some((contact) => contact.type === "makeup" && contact.memberId === memberId);
}

/** Removing responsibility keeps ordinary membership, including contact-only legacy members. */
export function toggleMakeupResponsibility(
  contacts: ProductionContact[],
  memberIds: string[],
  memberId: string,
  newContactId: string,
) {
  const selected = hasMakeupResponsibility(contacts, memberId);
  return {
    contacts: selected
      ? contacts.filter((contact) => contact.type !== "makeup" || contact.memberId !== memberId)
      : [
          ...contacts,
          {
            id: newContactId,
            role: "Maskenbetreuung",
            type: "makeup" as const,
            name: "",
            memberId,
          },
        ],
    memberIds: [...new Set([...memberIds, memberId])],
  };
}
