import { contactsValue, type DomainRecord, type Member } from "../../shared/contracts";

export interface ResolvedProductionContact {
  id: string;
  role: string;
  type: "external" | "makeup";
  name: string;
  organization?: string;
  position?: string;
  email?: string;
  phone?: string;
  notes?: string;
}
export function resolveProductionContacts(
  record: DomainRecord,
  members: Member[],
  people: DomainRecord[] = [],
): ResolvedProductionContact[] {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return contactsValue(record.data.contacts).map((contact) => {
    const profile =
      contact.type === "external"
        ? people.find((person) => person.id === contact.personId)?.data
        : undefined;
    return {
      id: contact.id,
      role: contact.role,
      type: contact.type,
      name:
        contact.type === "makeup"
          ? (names.get(contact.memberId) ?? contact.name) || "Teammitglied nicht verfügbar"
          : typeof profile?.name === "string" && profile.name
            ? profile.name
            : contact.name || "Kontakt nicht verfügbar",
      ...Object.fromEntries(
        ["organization", "position", "email", "phone", "notes"]
          .filter((key) => typeof profile?.[key] === "string" && profile[key])
          .map((key) => [key, String(profile![key])]),
      ),
    };
  });
}
export function productionContactsText(
  record: DomainRecord,
  members: Member[],
  people: DomainRecord[] = [],
): string {
  return resolveProductionContacts(record, members, people)
    .map((contact) =>
      [
        `${contact.role || "Kontakt"}: ${contact.name} (${contact.type === "makeup" ? "Maske" : "Extern"})`,
        contact.organization,
        contact.position,
        contact.email,
        contact.phone,
        contact.notes,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}
