export const recordKinds = [
  "productions",
  "actors",
  "characters",
  "casting",
  "sprints",
  "tasks",
  "events",
  "leave",
  "time",
  "looks",
  "templates",
  "messages",
  "materials",
  "handovers",
  "notifications",
  "timesheets",
  "files",
] as const;
export type RecordKind = (typeof recordKinds)[number];
export type Role = "superadmin" | "admin" | "user";
export type RecordData = Record<string, unknown>;
export interface DomainRecord {
  id: string;
  kind: RecordKind;
  organizationId: string;
  departmentId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  data: RecordData;
}
export interface Member {
  id: string;
  name: string;
  username: string;
  role: Role;
  status: "pending" | "active" | "disabled";
}
export interface Workspace {
  user: Member;
  organization: { id: string; name: string };
  department: { id: string; name: string };
  members: Member[];
  records: Record<RecordKind, DomainRecord[]>;
  timer: { id: string; data: RecordData } | null;
  projectHours: Record<string, number>;
}
export interface ApiError {
  error: string;
  details?: unknown;
}
export interface ActionRequest {
  action: string;
  id?: string;
  data?: RecordData;
}
export const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
export const numberValue = (value: unknown, fallback = 0) =>
  typeof value === "number" ? value : fallback;
export const listValue = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
