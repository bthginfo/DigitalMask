import type { records } from "@/platform/db/schema";
import { textValue, type DomainRecord } from "@/shared/contracts";

/** Snapshots only originate on the server; no snapshot data is accepted from a client. */
export function restoreRow(snapshot: DomainRecord): typeof records.$inferSelect {
  const indexed = snapshot as DomainRecord & Partial<typeof records.$inferSelect>;
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    organizationId: snapshot.organizationId,
    departmentId: snapshot.departmentId,
    createdBy: snapshot.createdBy,
    data: snapshot.data,
    version: snapshot.version,
    productionId: indexed.productionId ?? (textValue(snapshot.data.productionId) || null),
    ownerId: indexed.ownerId ?? (textValue(snapshot.data.userId) || null),
    parentId: indexed.parentId ?? (textValue(snapshot.data.parentId) || null),
    startAt: indexed.startAt ? new Date(indexed.startAt) : null,
    endAt: indexed.endAt ? new Date(indexed.endAt) : null,
    createdAt: new Date(snapshot.createdAt),
    updatedAt: new Date(snapshot.updatedAt),
  };
}
