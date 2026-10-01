import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { contactsValue, type RecordData } from "../src/shared/contracts";
import {
  mergePersonData,
  personNameKey,
  replacePersonReferences,
} from "../src/shared/person-identity";

nextEnv.loadEnvConfig(process.cwd());
const { db, sqlClient } = await import("../src/platform/db/index");
const { records, recordHistory, audit, outbox } = await import("../src/platform/db/schema");
const departmentId = process.env.MERGE_DEPARTMENT_ID || "maske";
const apply = process.argv.includes("--apply");
try {
  const summary = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`people:${departmentId}`}))`);
    const rows = await tx
      .select()
      .from(records)
      .where(eq(records.departmentId, departmentId))
      .for("update");
    const people = rows.filter((row) => row.kind === "people");
    const groups = new Map<string, typeof people>();
    for (const person of people) {
      const key = personNameKey(person.data.name);
      if (key) groups.set(key, [...(groups.get(key) || []), person]);
    }
    const duplicates = [...groups.values()].filter((group) => group.length > 1);
    const replacements = new Map<string, string>();
    const canonical = new Map<string, RecordData>();
    for (const group of duplicates) {
      group.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      );
      const [primary, ...others] = group;
      canonical.set(
        primary.id,
        mergePersonData(
          primary.data,
          others.map((row) => row.data),
        ),
      );
      for (const other of others) replacements.set(other.id, primary.id);
    }
    const linkedContactsBefore = rows
      .filter((row) => row.kind === "productions")
      .flatMap((row) =>
        contactsValue(row.data.contacts).map((contact) => ({ productionId: row.id, ...contact })),
      );
    const affected = rows.filter((row) => {
      const data = canonical.get(row.id) || replacePersonReferences(row.data, replacements);
      return (
        !replacements.has(row.id) &&
        (JSON.stringify(data) !== JSON.stringify(row.data) || replacements.has(row.parentId || ""))
      );
    });
    const result = {
      before: people.length,
      duplicateGroups: duplicates.length,
      removed: replacements.size,
      after: people.length - replacements.size,
      changedRecords: affected.length,
      contactLinks: linkedContactsBefore.length,
      applied: apply,
    };
    if (!apply || !replacements.size) return result;
    const history = rows.length
      ? await tx
          .select()
          .from(recordHistory)
          .where(
            inArray(
              recordHistory.recordId,
              rows.map((row) => row.id),
            ),
          )
      : [];
    const events = await tx.select().from(outbox).where(eq(outbox.departmentId, departmentId));
    // Durable local rollback material is saved before the first mutation, never tracked by Git.
    await mkdir(".local", { recursive: true });
    await writeFile(
      `.local/contacts-backup-${Date.now()}.json`,
      JSON.stringify({ rows, history, events, replacements: [...replacements] }),
    );
    for (const row of affected)
      await tx
        .update(records)
        .set({
          data: (canonical.get(row.id) ||
            replacePersonReferences(row.data, replacements)) as RecordData,
          parentId: replacements.get(row.parentId || "") || row.parentId,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(records.id, row.id));
    const nextVersion = new Map<string, number>();
    for (const entry of history) {
      const target = replacements.get(entry.recordId);
      const data = replacePersonReferences(entry.data, replacements) as RecordData;
      if (target) {
        const version =
          (nextVersion.get(target) ??
            Math.max(
              0,
              ...history.filter((item) => item.recordId === target).map((item) => item.version),
            )) + 1;
        nextVersion.set(target, version);
        await tx
          .update(recordHistory)
          .set({ recordId: target, version, data })
          .where(eq(recordHistory.id, entry.id));
      } else if (JSON.stringify(data) !== JSON.stringify(entry.data))
        await tx.update(recordHistory).set({ data }).where(eq(recordHistory.id, entry.id));
    }
    for (const [from, to] of replacements)
      await tx
        .update(audit)
        .set({ recordId: to })
        .where(and(eq(audit.departmentId, departmentId), eq(audit.recordId, from)));
    for (const event of events) {
      const payload = replacePersonReferences(event.payload, replacements) as RecordData;
      if (JSON.stringify(payload) !== JSON.stringify(event.payload))
        await tx.update(outbox).set({ payload }).where(eq(outbox.id, event.id));
    }
    await tx
      .delete(records)
      .where(
        and(
          eq(records.departmentId, departmentId),
          eq(records.kind, "people"),
          inArray(records.id, [...replacements.keys()]),
        ),
      );
    const updated = await tx.select().from(records).where(eq(records.departmentId, departmentId));
    const updatedPeople = new Set(
      updated.filter((row) => row.kind === "people").map((row) => row.id),
    );
    const linkedContactsAfter = updated
      .filter((row) => row.kind === "productions")
      .flatMap((row) =>
        contactsValue(row.data.contacts).map((contact) => ({ productionId: row.id, ...contact })),
      );
    const expected = replacePersonReferences(
      linkedContactsBefore,
      replacements,
    ) as typeof linkedContactsBefore;
    const comparable = (links: typeof linkedContactsBefore) =>
      JSON.stringify(
        links
          .map((contact) => ({
            productionId: contact.productionId,
            id: contact.id,
            role: contact.role,
            type: contact.type,
            name: contact.name,
            memberId: contact.memberId,
            personId: contact.personId || "",
          }))
          .sort((a, b) => a.productionId.localeCompare(b.productionId) || a.id.localeCompare(b.id)),
      );
    if (
      comparable(expected) !== comparable(linkedContactsAfter) ||
      linkedContactsAfter.some(
        (contact) => contact.personId && !updatedPeople.has(contact.personId),
      )
    )
      throw new Error("Contact link verification failed; transaction rolled back");
    return result;
  });
  console.log(JSON.stringify(summary));
} finally {
  await sqlClient.end();
}
