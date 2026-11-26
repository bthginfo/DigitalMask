import { recordKinds, type RecordKind, type Workspace } from "./contracts";

/** Small independently invalidated snapshots; no notification history in a shared cache. */
export const workspaceGroups = {
  productions: ["productions", "people"],
  ensemble: ["actors", "characters", "casting", "maskPlans"],
  calendar: ["events", "calendarCategories", "leave", "shiftSwaps"],
  work: ["tasks", "sprints", "time", "attendance"],
  notes: ["looks", "templates", "handovers"],
  inventory: ["materials", "reservations", "categories"],
  // Conversations decide chat visibility for every partial request; messages are loaded separately.
  conversations: ["conversations"],
  messages: ["messages"],
  files: ["files"],
  feedback: ["feedback"],
} as const satisfies Record<string, readonly RecordKind[]>;

export type WorkspaceGroup = keyof typeof workspaceGroups;
/**
 * Groups that grow with time. Their shared snapshots are cached per calendar year of
 * `created_at`, so no single data-cache entry approaches Next's 2 MB per-entry limit.
 */
export const yearBucketedGroups: readonly WorkspaceGroup[] = ["calendar", "work", "notes", "files"];

export const workspaceKindTag = (departmentId: string, kind: RecordKind) =>
  `workspace-kind:${departmentId}:${kind}`;
export const notificationUserTag = (departmentId: string, userId: string) =>
  `workspace-notices:${departmentId}:${userId}`;
export const chatReadUserTag = (departmentId: string, userId: string) =>
  `workspace-chat-reads:${departmentId}:${userId}`;

/** Mutating requests carry the writing tab's id so its own live echo can be ignored. */
export const clientOriginHeader = "x-dm-client";
export function clientOriginValue(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : undefined;
}
/** Document capabilities only depend on productions, chats, files and memberships. */
export const permissionKinds: readonly RecordKind[] = ["productions", "conversations", "files"];
/**
 * Team data (members, roles, working time) is part of every partial patch. The caller's
 * personal notification slice is the cheapest carrier for a team-only change.
 */
export const teamChangeKinds: readonly RecordKind[] = ["notifications"];

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

/**
 * Related writes performed by production contacts and inline casting. Saving an actor never
 * writes files; portrait uploads and normalization invalidate "files" on their own paths.
 */
export function recordChangeKinds(kind: RecordKind): RecordKind[] {
  if (kind === "productions") return ["productions", "people"];
  if (kind === "casting") return ["casting", "actors", "characters"];
  return [kind];
}

/** Per-user chat unread counters change with new messages and with the caller's reads. */
export const chatUnreadKinds: readonly RecordKind[] = ["messages", "notifications"];

export interface WorkspacePatch {
  partial: true;
  user: Workspace["user"];
  members: Workspace["members"];
  live: Workspace["live"];
  records: Partial<Workspace["records"]>;
  timer?: Workspace["timer"];
  attendanceTimer?: Workspace["attendanceTimer"];
  projectHours?: Workspace["projectHours"];
  chatUnread?: Workspace["chatUnread"];
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
    ...(kinds.some((kind) => chatUnreadKinds.includes(kind))
      ? { chatUnread: workspace.chatUnread }
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
    ...("chatUnread" in next ? { chatUnread: next.chatUnread } : {}),
  };
}
