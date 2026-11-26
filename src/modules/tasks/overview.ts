import { listValue, textValue, type DomainRecord } from "@/shared/contracts";
import { sortProductionsByPremiere } from "@/shared/production-order";

/** The three statuses the team works with. Backlog and review stay readable for older tasks. */
export type TaskStatus = "todo" | "doing" | "done";
export const taskStatuses: [TaskStatus, string][] = [
  ["todo", "Offen"],
  ["doing", "In Arbeit"],
  ["done", "Erledigt"],
];
const legacyStatuses: Record<string, { group: TaskStatus; tag: string }> = {
  backlog: { group: "todo", tag: "Später" },
  review: { group: "doing", tag: "Prüfen" },
};

export function taskStatusGroup(status: unknown): TaskStatus {
  const key = textValue(status);
  if (key === "doing" || key === "done") return key;
  return legacyStatuses[key]?.group ?? "todo";
}

/** Small hint shown next to a legacy status, e.g. „Später“ for backlog. */
export function taskStatusTag(status: unknown) {
  return legacyStatuses[textValue(status)]?.tag ?? "";
}

export function taskStatusLabel(status: unknown) {
  const group = taskStatuses.find(([id]) => id === taskStatusGroup(status))![1];
  const tag = taskStatusTag(status);
  return tag ? `${group} · ${tag}` : group;
}

/** New tasks only offer three statuses; an existing legacy status stays selectable. */
export function taskStatusOptions(current?: unknown): [string, string][] {
  const key = textValue(current);
  const options: [string, string][] = taskStatuses.map(([id, label]) => [id, label]);
  if (!legacyStatuses[key]) return options;
  const index = options.findIndex(([id]) => id === legacyStatuses[key].group);
  options.splice(index + 1, 0, [key, taskStatusLabel(key)]);
  return options;
}

/** Dropping a task into its own column keeps a legacy status instead of rewriting it. */
export function statusAfterDrop(current: unknown, column: string) {
  if (!taskStatuses.some(([id]) => id === column)) return null;
  return taskStatusGroup(current) === column ? null : column;
}

export const isOpenTask = (task: DomainRecord) => taskStatusGroup(task.data.status) !== "done";

const validDay = (due: unknown) => {
  const day = textValue(due).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
};
export const taskDueDay = (task: DomainRecord) => validDay(task.data.due);

export function isTaskOverdue(task: DomainRecord, today: string) {
  const due = taskDueDay(task);
  return !!due && due < today && isOpenTask(task);
}

export function checklistProgress(task: DomainRecord) {
  const items = Array.isArray(task.data.checklist)
    ? (task.data.checklist as { done?: unknown }[])
    : [];
  return { done: items.filter((item) => item?.done === true).length, total: items.length };
}

const priorityRank: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Earliest due date first (undated last), then higher priority, then title. */
export function compareTasks(a: DomainRecord, b: DomainRecord) {
  const left = taskDueDay(a),
    right = taskDueDay(b);
  return (
    Number(!left) - Number(!right) ||
    left.localeCompare(right) ||
    (priorityRank[textValue(a.data.priority)] ?? 1) -
      (priorityRank[textValue(b.data.priority)] ?? 1) ||
    textValue(a.data.title).localeCompare(textValue(b.data.title), "de") ||
    a.id.localeCompare(b.id)
  );
}

export const isAssignedTo = (task: DomainRecord, userId: string) =>
  listValue(task.data.assigneeIds).includes(userId);

export interface TaskGroup {
  /** Production id, or "" for general tasks without a production. */
  id: string;
  title: string;
  color: string;
  production?: DomainRecord;
  tasks: DomainRecord[];
}
export const generalGroupTitle = "Allgemein";

/**
 * Groups tasks by Stück. "urgency" puts the group with the most pressing task first,
 * "premiere" follows the production list order. General tasks form the „Allgemein“ group.
 */
export function groupTasksByProduction(
  tasks: DomainRecord[],
  productions: DomainRecord[],
  order: "urgency" | "premiere" = "urgency",
): TaskGroup[] {
  const byId = new Map(productions.map((production) => [production.id, production]));
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const id = textValue(task.data.productionId);
    const production = id ? byId.get(id) : undefined;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        title: id ? textValue(production?.data.title) || "Stück" : generalGroupTitle,
        color: id ? textValue(production?.data.color) || "#8e8e93" : "",
        production,
        tasks: [],
      };
      groups.set(id, group);
    }
    group.tasks.push(task);
  }
  const result = [...groups.values()];
  for (const group of result) group.tasks.sort(compareTasks);
  if (order === "premiere") {
    const position = new Map(sortProductionsByPremiere(productions).map((row, i) => [row.id, i]));
    return result.sort(
      (a, b) =>
        Number(!!a.id) - Number(!!b.id) ||
        (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity) ||
        a.title.localeCompare(b.title, "de"),
    );
  }
  return result.sort(
    (a, b) =>
      compareTasks(a.tasks[0], b.tasks[0]) ||
      Number(!!a.id) - Number(!!b.id) ||
      a.title.localeCompare(b.title, "de"),
  );
}

/** Most recently completed first. */
export const sortDoneTasks = (tasks: DomainRecord[]) =>
  [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || compareTasks(a, b));

/** Sprints stay hidden until a team turns them on; productions with sprints count as on. */
export function sprintsEnabled(production: DomainRecord | undefined, sprints: DomainRecord[]) {
  if (!production) return false;
  if (typeof production.data.sprintsEnabled === "boolean") return production.data.sprintsEnabled;
  return sprints.some((sprint) => sprint.data.productionId === production.id);
}

export type TaskView = "mine" | "team" | "productions";
export const taskViews: [TaskView, string][] = [
  ["mine", "Meine Aufgaben"],
  ["team", "Team"],
  ["productions", "Alle Stücke"],
];
export const parseTaskView = (value: unknown): TaskView | null =>
  taskViews.some(([id]) => id === value) ? (value as TaskView) : null;
