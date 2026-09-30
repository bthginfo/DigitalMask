import type { DomainRecord, Member, RecordKind } from "../../shared/contracts";

export type ExportFormat = "pdf" | "xlsx" | "csv" | "ics" | "json";
export interface ExportInput {
  kind: string;
  format: ExportFormat;
  records: DomainRecord[];
  members: Member[];
  organization: string;
  department: string;
  from?: string;
  to?: string;
  view?: string;
  teamOnly?: boolean;
  productionId?: string;
  userIds?: string[];
  images?: Record<string, Uint8Array>;
  references?: Partial<Record<RecordKind, DomainRecord[]>>;
}
export interface ExportResult {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}
export interface Column {
  key: string;
  label: string;
  width: number;
  type?: "date" | "duration";
}
export interface ExportRow {
  id: string;
  values: Record<string, string | number | Date>;
  record: DomainRecord;
}
