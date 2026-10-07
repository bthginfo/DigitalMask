import type { DomainRecord, RecordKind } from "@/shared/contracts";

export interface UndoReceipt {
  id: string;
  label: string;
  expiresAt: string;
}

export type MutationRecord = DomainRecord & { undo?: UndoReceipt };
export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}
export interface ChangeSummary {
  id: string;
  recordId: string;
  kind: RecordKind;
  operation: "created" | "updated" | "deleted" | "undone";
  userId: string;
  createdAt: string;
  title: string;
  productionId: string;
  version: number;
  fields: FieldChange[];
}
export interface ChangeFeed {
  changes: ChangeSummary[];
  cursor: string;
}
