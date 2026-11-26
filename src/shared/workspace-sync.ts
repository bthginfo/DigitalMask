import { recordKinds, type DomainRecord, type RecordKind, type Workspace } from "./contracts";

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

const sameRecord = (a: DomainRecord, b: DomainRecord) =>
  a === b ||
  (a.id === b.id && a.kind === b.kind && a.version === b.version && a.updatedAt === b.updatedAt);

/**
 * Keep the previous array and record objects when the server sends the same versions again, so
 * memoized views (calendar balances, event expansion, chat rows) skip unrelated updates.
 */
export function shareRecords(current: DomainRecord[] | undefined, next: DomainRecord[]) {
  if (!current || current === next) return next;
  const previous = new Map(current.map((record) => [record.id, record]));
  let changed = current.length !== next.length;
  const merged = next.map((record, index) => {
    const known = previous.get(record.id);
    if (known && sameRecord(known, record)) {
      if (current[index] !== known) changed = true;
      return known;
    }
    changed = true;
    return record;
  });
  return changed ? merged : current;
}

/** Structural equality for small, plain JSON values such as members, the user or timers. */
function shareValue<T>(current: T, next: T): T {
  if (current === next) return current;
  try {
    return JSON.stringify(current) === JSON.stringify(next) ? current : next;
  } catch {
    return next;
  }
}

function shareRecordMap(
  current: Workspace["records"],
  next: Partial<Workspace["records"]>,
): Workspace["records"] {
  let changed = false;
  const merged = { ...current };
  for (const kind of Object.keys(next) as RecordKind[]) {
    const rows = next[kind];
    if (!rows) continue;
    const shared = shareRecords(current[kind], rows);
    if (shared !== current[kind]) {
      merged[kind] = shared;
      changed = true;
    }
  }
  return changed ? merged : current;
}

export function mergeWorkspaceUpdate(
  current: Workspace | null,
  next: Workspace | WorkspacePatch,
): Workspace {
  if (!("partial" in next)) {
    if (!current) return next;
    const records = shareRecordMap(current.records, next.records);
    // Kinds missing from a full snapshot are no longer visible.
    const visible = (Object.keys(current.records) as RecordKind[]).every(
      (kind) => kind in next.records,
    )
      ? records
      : (Object.fromEntries(
          (Object.keys(next.records) as RecordKind[]).map((kind) => [kind, records[kind]]),
        ) as Workspace["records"]);
    return {
      ...next,
      user: shareValue(current.user, next.user),
      members: shareValue(current.members, next.members),
      organization: shareValue(current.organization, next.organization),
      department: shareValue(current.department, next.department),
      records: visible,
      calendarProductions:
        next.calendarProductions &&
        shareRecords(current.calendarProductions, next.calendarProductions),
      productionOverview:
        next.productionOverview &&
        shareRecords(current.productionOverview, next.productionOverview),
      timer: shareValue(current.timer, next.timer),
      ...("attendanceTimer" in next
        ? { attendanceTimer: shareValue(current.attendanceTimer, next.attendanceTimer) }
        : {}),
      projectHours: shareValue(current.projectHours, next.projectHours),
    };
  }
  if (!current) throw new Error("Ein vollständiger Arbeitsbereich muss zuerst geladen werden.");
  return {
    ...current,
    user: shareValue(current.user, next.user),
    members: shareValue(current.members, next.members),
    live: next.live,
    records: shareRecordMap(current.records, next.records),
    ...("timer" in next ? { timer: shareValue(current.timer, next.timer) } : {}),
    ...("attendanceTimer" in next
      ? { attendanceTimer: shareValue(current.attendanceTimer, next.attendanceTimer) }
      : {}),
    ...("projectHours" in next
      ? { projectHours: shareValue(current.projectHours, next.projectHours) }
      : {}),
  };
}

/** Drop deleted records (and attachments the server deletes with them) without a reload. */
export function withoutRecords(workspace: Workspace, ids: ReadonlySet<string>): Workspace {
  if (!ids.size) return workspace;
  let changed = false;
  const records = { ...workspace.records };
  for (const kind of Object.keys(records) as RecordKind[]) {
    const rows = records[kind];
    if (!rows.some((record) => ids.has(record.id))) continue;
    records[kind] = rows.filter((record) => !ids.has(record.id));
    changed = true;
  }
  return changed ? { ...workspace, records } : workspace;
}
