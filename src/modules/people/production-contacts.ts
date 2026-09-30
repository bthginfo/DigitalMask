import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { records } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { HttpError } from "@/platform/http";
import { contactsValue, type RecordData } from "@/shared/contracts";

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
  const people = ids.length
    ? await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.departmentId, context.departmentId),
            eq(records.kind, "people"),
            inArray(records.id, ids),
          ),
        )
        .for("key share")
    : [];
  if (people.length !== ids.length)
    throw new HttpError(400, "Eine ausgewählte Kontaktperson wurde nicht gefunden.");
  const additions: (typeof records.$inferInsert)[] = [];
  for (const contact of contacts) {
    if (contact.personId) {
      contact.name = String(people.find((person) => person.id === contact.personId)!.data.name);
    } else if (!contact.memberId && contact.name) {
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
