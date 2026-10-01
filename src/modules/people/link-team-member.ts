import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Transaction } from "@/platform/db";
import { memberships, records, user } from "@/platform/db/schema";
import type { Context } from "@/platform/context";
import { contactsValue, listValue, textValue } from "@/shared/contracts";
import { isMakeupContact, uniqueMemberForContact } from "@/shared/person-identity";

/** Called in the admin approval transaction; never trusts a pending registration alone. */
export async function linkApprovedMakeupContacts(
  context: Context,
  memberId: string,
  tx: Transaction,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`people:${context.departmentId}`}))`,
  );
  const members = await tx
    .select({ id: user.id, name: user.name })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(
      and(
        eq(memberships.departmentId, context.departmentId),
        eq(memberships.status, "active"),
        ne(memberships.role, "superadmin"),
      ),
    );
  if (!members.some((member) => member.id === memberId)) return { contacts: 0, productions: 0 };
  const rows = await tx
    .select()
    .from(records)
    .where(
      and(
        eq(records.departmentId, context.departmentId),
        inArray(records.kind, ["people", "productions"]),
      ),
    )
    .for("update");
  const people = rows.filter((row) => row.kind === "people");
  const projects = rows.filter((row) => row.kind === "productions");
  const nameFor = (contact: ReturnType<typeof contactsValue>[number]) =>
    textValue(people.find((person) => person.id === contact.personId)?.data.name) || contact.name;
  const knownNames = projects.flatMap((project) =>
    contactsValue(project.data.contacts).filter(isMakeupContact).map(nameFor),
  );
  let contacts = 0,
    productions = 0;
  const linkedPeople = new Set<string>();
  for (const project of projects) {
    let changed = false;
    const updatedContacts = contactsValue(project.data.contacts).map((contact) => {
      if (contact.memberId || !isMakeupContact(contact)) return contact;
      const candidate = uniqueMemberForContact(nameFor(contact), members, knownNames);
      if (candidate?.id !== memberId) return contact;
      if (contact.personId) linkedPeople.add(contact.personId);
      changed = true;
      contacts++;
      return { ...contact, type: "makeup" as const, memberId, name: "", personId: "" };
    });
    if (changed) {
      const memberIds = [...new Set([...listValue(project.data.memberIds), memberId])];
      await tx
        .update(records)
        .set({
          data: { ...project.data, contacts: updatedContacts, memberIds },
          version: project.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(records.id, project.id));
      productions++;
    }
  }
  for (const person of people)
    if (linkedPeople.has(person.id)) {
      // Keep all directory details, but show this identity as a team member from now on.
      await tx
        .update(records)
        .set({
          data: { ...person.data, linkedMemberId: memberId },
          version: person.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(records.id, person.id));
    }
  return { contacts, productions };
}
