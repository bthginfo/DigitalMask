import { recordKinds, type RecordKind, type Workspace } from "./contracts";

/** Small independently invalidated snapshots; no notification history in a shared cache. */
export const workspaceGroups = {
  productions: ["productions", "people"],
  ensemble: ["actors", "characters", "casting", "maskPlans"],
  calendar: ["events", "calendarCategories", "leave", "shiftSwaps"],
  work: ["tasks", "sprints", "time", "attendance"],
  notes: ["looks", "templates", "handovers"],
  inventory: ["materials", "reservations", "categories"],
  chat: ["messages", "conversations"],
  files: ["files"],
  feedback: ["feedback"],
} as const satisfies Record<string, readonly RecordKind[]>;

export const workspaceKindTag = (departmentId: string, kind: RecordKind) =>
  `workspace-kind:${departmentId}:${kind}`;
export const notificationUserTag = (departmentId: string, userId: string) =>
  `workspace-notices:${departmentId}:${userId}`;

/** Visibility changes and attachment changes require rechecking the complete visible set. */
export function partialWorkspaceKinds(kinds?: readonly RecordKind[]): RecordKind[] | undefined {
  if (!kinds || kinds.some((kind) => ["productions", "conversations", "files"].includes(kind)))
    return undefined;
  return [...new Set(kinds)].filter((kind) => kind !== "timesheets");
}

export function parseLiveKinds(value: unknown): RecordKind[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= recordKinds.length &&
    value.every((kind): kind is RecordKind => recordKinds.includes(kind as RecordKind))
    ? [...new Set(value)]
    : undefined;
}

/** Related writes performed by production contacts, inline casting and portrait normalization. */
export function recordChangeKinds(kind: RecordKind): RecordKind[] {
  if (kind === "productions") return ["productions", "people"];
  if (kind === "casting") return ["casting", "actors", "characters"];
  if (kind === "actors") return ["actors", "files"];
  return [kind];
}

export interface WorkspacePatch {
  partial: true;
  user: Workspace["user"];
  members: Workspace["members"];
  live: Workspace["live"];
  records: Partial<Workspace["records"]>;
  timer?: Workspace["timer"];
  attendanceTimer?: Workspace["attendanceTimer"];
  projectHours?: Workspace["projectHours"];
}

export function workspacePatch(workspace: Workspace, kinds: readonly RecordKind[]): WorkspacePatch {
  return {
    partial: true,
    user: workspace.user,
    members: workspace.members,
    live: workspace.live,
    records: Object.fromEntries(kinds.map((kind) => [kind, workspace.records[kind]])),
    ...(kinds.some((kind) => kind === "time" || kind === "attendance")
      ? {
          timer: workspace.timer,
          attendanceTimer: workspace.attendanceTimer,
          ...(kinds.includes("time") ? { projectHours: workspace.projectHours } : {}),
        }
      : {}),
  };
}

export function mergeWorkspaceUpdate(
  current: Workspace | null,
  next: Workspace | WorkspacePatch,
): Workspace {
  if (!("partial" in next)) return next;
  if (!current) throw new Error("Ein vollständiger Arbeitsbereich muss zuerst geladen werden.");
  return {
    ...current,
    user: next.user,
    members: next.members,
    live: next.live,
    records: { ...current.records, ...next.records },
    ...("timer" in next ? { timer: next.timer } : {}),
    ...("attendanceTimer" in next ? { attendanceTimer: next.attendanceTimer } : {}),
    ...("projectHours" in next ? { projectHours: next.projectHours } : {}),
  };
}
