import { and, eq } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { contactsValue, type RecordData } from "@/shared/contracts";
import { isMakeupContact, personNameKey, uniqueMemberForContact } from "@/shared/person-identity";

/** Persist free names once, and resolve all directory references in a single lookup. */
export async function prepareProductionContacts(
  context: Context,
  data: RecordData,
  tx: Transaction,
  existing?: typeof records.$inferSelect,
) {
  const previous = contactsValue(existing?.data.contacts);
  const contacts = contactsValue(data.contacts).map((contact) => {
    const old = previous.find((item) => item.id === contact.id);
    return !contact.personId && !contact.memberId && old?.personId && old.name === contact.name
      ? { ...contact, personId: old.personId }
      : { ...contact };
  });
  const ids = Array.from(
    new Set(contacts.flatMap((contact) => (contact.personId ? [contact.personId] : []))),
  );
  // Caller holds the shared department contact lock before locking production rows.
  const people = await tx
    .select()
    .from(records)
    .where(and(eq(records.departmentId, context.departmentId), eq(records.kind, "people")))
    .for("key share");
  if (ids.some((id) => !people.some((person) => person.id === id)))
    throw new HttpError(400, "Eine ausgewählte Kontaktperson wurde nicht gefunden.");
  const additions: (typeof records.$inferInsert)[] = [];
  const linkedMembers = people
    .filter((person) => person.data.linkedMemberId)
    .map((person) => ({ id: String(person.data.linkedMemberId), name: String(person.data.name) }));
  for (const contact of contacts) {
    const linkedPerson = people.find(
      (person) =>
        person.id === contact.personId ||
        (!contact.memberId && personNameKey(person.data.name) === personNameKey(contact.name)),
    );
    const linkedMemberId =
      linkedPerson?.data.linkedMemberId ||
      (!contact.memberId && isMakeupContact(contact)
        ? uniqueMemberForContact(
            contact.name,
            linkedMembers,
            people.map((person) => String(person.data.name)),
          )?.id
        : undefined);
    if (isMakeupContact(contact) && linkedMemberId) {
      contact.type = "makeup";
      contact.memberId = String(linkedMemberId);
      contact.personId = "";
      contact.name = "";
      continue;
    }
    if (contact.personId) {
      contact.name = String(people.find((person) => person.id === contact.personId)!.data.name);
    } else if (!contact.memberId && contact.name) {
      const existingPerson =
        people.find((person) => personNameKey(person.data.name) === personNameKey(contact.name)) ||
        additions.find(
          (person) => personNameKey(person.data?.name) === personNameKey(contact.name),
        );
      if (existingPerson) {
        contact.personId = existingPerson.id;
        contact.name = String(existingPerson.data?.name);
        continue;
      }
      contact.personId = crypto.randomUUID();
      additions.push({
        id: contact.personId,
        kind: "people",
        organizationId: context.organizationId,
        departmentId: context.departmentId,
        createdBy: context.user.id,
        data: {
          name: contact.name,
          organization: "",
          position: contact.role,
          email: "",
          phone: "",
          notes: "",
        },
      });
    }
  }
  if (additions.length) {
    await tx.insert(records).values(additions);
  }
  data.contacts = contacts;
}
