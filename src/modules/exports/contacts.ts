import { contactsValue, type DomainRecord, type Member } from "../../shared/contracts";

export interface ResolvedProductionContact {
  id: string;
  role: string;
  type: "external" | "makeup";
  name: string;
}
export function resolveProductionContacts(
  record: DomainRecord,
  members: Member[],
): ResolvedProductionContact[] {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return contactsValue(record.data.contacts).map((contact) => ({
    id: contact.id,
    role: contact.role,
    type: contact.type,
    name:
      contact.type === "makeup"
        ? (names.get(contact.memberId) ?? contact.name) || "Teammitglied nicht verfügbar"
        : contact.name,
  }));
}
export function productionContactsText(record: DomainRecord, members: Member[]): string {
  return resolveProductionContacts(record, members)
    .map(
      (contact) =>
        `${contact.role || "Kontakt"}: ${contact.name} (${contact.type === "makeup" ? "Maske" : "Extern"})`,
    )
    .join("\n");
}
