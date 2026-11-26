"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CalendarDays, CheckSquare, ChevronRight, Flag, Plus } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, ids, localDate, value } from "@/shared/client-api";
import { initialPeriod, recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { useViewState } from "@/shared/view-state";
import { subscribeLocation } from "@/shared/client-storage";
import { navigateWorkspace } from "@/shared/client-navigation";
import { canManageRecord } from "@/shared/record-permissions";
import { useCollapsedPreference } from "@/shared/use-collapsed-preference";
import { PeriodPicker } from "@/components/period-picker";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, PageHeader } from "@/components/ui";
import { ResourceEditor } from "@/components/resource-editor";
import { RecordDetail } from "@/components/resource-view";
import {
  checklistProgress,
  groupTasksByProduction,
  isAssignedTo,
  isOpenTask,
  isTaskOverdue,
  parseTaskView,
  sortDoneTasks,
  taskDueDay,
  taskStatusGroup,
  taskStatusTag,
  taskViews,
  type TaskView,
} from "../overview";
import styles from "./task-overview.module.css";

const viewKey = (userId: string) => `digitalmask-task-view-segment:${userId}`;
const readStoredView = (userId: string) => {
  try {
    return parseTaskView(localStorage.getItem(viewKey(userId)));
  } catch {
    return null;
  }
};

/**
 * The Teamboard segment: ?view= wins, then the choice saved on this device, then
 * Meine Aufgaben when something is assigned to the person, otherwise Team.
 */
export function useTaskView() {
  const { workspace } = useWorkspace();
  const userId = workspace.user.id;
  const urlView = useSyncExternalStore(
    subscribeLocation,
    () => parseTaskView(new URLSearchParams(location.search).get("view")),
    () => null,
  );
  const [stored, setStored] = useState(() => readStoredView(userId));
  const [fallback] = useState<TaskView>(() => {
    const period = initialPeriod(workspace.records.productions);
    return workspace.records.tasks.some(
      (task) =>
        isAssignedTo(task, userId) &&
        isOpenTask(task) &&
        recordMatchesPeriod(task, period, workspace.records.productions),
    )
      ? "mine"
      : "team";
  });
  const view = urlView ?? stored ?? fallback;
  const choose = (next: TaskView) => {
    try {
      localStorage.setItem(viewKey(userId), next);
    } catch {
      // The segment still switches when device storage is unavailable.
    }
    setStored(next);
    const url = new URL(location.href);
    if (url.searchParams.get("view") === next) return;
    url.searchParams.set("view", next);
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return [view, choose] as const;
}

export function TaskViewSwitch({
  value: current,
  onChange,
}: {
  value: TaskView;
  onChange: (view: TaskView) => void;
}) {
  return (
    <div
      className={`segmented task-view-switch ${styles.switch}`}
      data-whats-new="my-tasks"
      role="group"
      aria-label="Aufgaben anzeigen"
    >
      {taskViews.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={current === id ? "active" : ""}
          aria-pressed={current === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  production,
  today,
  showProduction,
  showAssignees,
  checkable,
  checked,
  pending,
  onToggle,
  onOpen,
}: {
  task: DomainRecord;
  production?: DomainRecord;
  today: string;
  showProduction: boolean;
  showAssignees: boolean;
  checkable: boolean;
  checked: boolean;
  pending: boolean;
  onToggle: (done: boolean) => void;
  onOpen: () => void;
}) {
  const { workspace } = useWorkspace();
  const title = value(task.data, "title");
  const due = taskDueDay(task);
  const overdue = isTaskOverdue(task, today) && !checked;
  const progress = checklistProgress(task);
  const group = taskStatusGroup(task.data.status);
  const tag = taskStatusTag(task.data.status);
  const assignees = showAssignees
    ? ids(task.data, "assigneeIds")
        .map((id) => workspace.members.find((person) => person.id === id)?.name)
        .filter(Boolean)
    : [];
  return (
    <li className={`${styles.row} ${checked ? styles.rowDone : ""}`}>
      {checkable ? (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={checked}
            disabled={pending || !canManageRecord(workspace.user, "tasks", task)}
            aria-label={`Erledigt: ${title}`}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>
      ) : (
        <span className={styles.statusSlot} aria-hidden="true">
          <span className={`status-dot ${group}`} />
        </span>
      )}
      <button type="button" className={styles.open} onClick={onOpen}>
        <span className={styles.text}>
          <strong>{title}</strong>
          <span className={styles.meta}>
            {showProduction && (
              <span className={styles.production}>
                <span
                  className={styles.dot}
                  style={production ? { background: value(production.data, "color") } : undefined}
                />
                {production ? value(production.data, "title") : "Allgemein"}
              </span>
            )}
            {!checkable && (
              <span>
                {group === "doing" ? "In Arbeit" : group === "done" ? "Erledigt" : "Offen"}
              </span>
            )}
            {checkable && group === "doing" && <span className={styles.tag}>In Arbeit</span>}
            {!!tag && <span className={styles.tag}>{tag}</span>}
            {task.data.priority === "high" && (
              <span className={styles.high}>
                <Flag size={12} aria-hidden="true" /> Hoch
              </span>
            )}
            {!!due && (
              <span className={overdue ? styles.overdue : ""}>
                <CalendarDays size={13} aria-hidden="true" />
                {overdue ? `Überfällig · ${dateLabel(due)}` : dateLabel(due)}
              </span>
            )}
            {progress.total > 0 && (
              <span aria-label={`Checkliste ${progress.done} von ${progress.total}`}>
                <CheckSquare size={13} aria-hidden="true" />
                {progress.done}/{progress.total}
              </span>
            )}
            {assignees.length > 0 && <span>{assignees.join(", ")}</span>}
          </span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

/** „Meine Aufgaben“ and „Alle Stücke“: grouped by Stück, sorted by due date and priority. */
export function TaskOverview({
  mode,
  switcher,
}: {
  mode: Exclude<TaskView, "team">;
  switcher: ReactNode;
}) {
  const { workspace, save } = useWorkspace();
  const userId = workspace.user.id;
  const productions = workspace.records.productions;
  const scope = `tasks:${mode}`;
  const [period, setPeriod] = useViewState<PeriodFilter>(userId, scope, "period", () =>
    initialPeriod(productions),
  );
  const [search, setSearch] = useViewState(userId, scope, "search", "");
  const [doneCollapsed, setDoneCollapsed] = useCollapsedPreference(
    `digitalmask-tasks-done:${userId}`,
    true,
  );
  const [doneLimit, setDoneLimit] = useState(20);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [today] = useState(() => localDate());
  const mine = mode === "mine";
  const source = workspace.records.tasks.filter((task) =>
    mine ? isAssignedTo(task, userId) : !!value(task.data, "productionId"),
  );
  const query = search.trim().toLowerCase();
  const visible = source.filter(
    (task) =>
      recordMatchesPeriod(task, period, productions) &&
      (!query || value(task.data, "title").toLowerCase().includes(query)),
  );
  const open = visible.filter(isOpenTask);
  const done = sortDoneTasks(visible.filter((task) => !isOpenTask(task)));
  const groups = groupTasksByProduction(
    mine ? open : visible,
    productions,
    mine ? "urgency" : "premiere",
  );
  const productionOf = (task: DomainRecord) =>
    productions.find((row) => row.id === task.data.productionId);
  const toggle = async (task: DomainRecord, next: boolean) => {
    if (task.id in pending) return;
    setError("");
    setPending((current) => ({ ...current, [task.id]: next }));
    try {
      await save("tasks", { status: next ? "done" : "todo" }, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setPending((current) => {
        const rest = { ...current };
        delete rest[task.id];
        return rest;
      });
    }
  };
  const row = (task: DomainRecord) => (
    <TaskRow
      key={task.id}
      task={task}
      production={productionOf(task)}
      today={today}
      showProduction={mine}
      showAssignees={!mine}
      checkable={mine}
      checked={pending[task.id] ?? !isOpenTask(task)}
      pending={task.id in pending}
      onToggle={(next) => void toggle(task, next)}
      onOpen={() => setDetail(task)}
    />
  );
  return (
    <section className={styles.overview}>
      <PageHeader
        compact
        eyebrow="GEMEINSAM VORAN"
        title="Teamboard"
        description={
          mine
            ? "Deine offenen Aufgaben aus allen Stücken und dem Teamboard."
            : "Die Aufgaben aller Stücke auf einen Blick."
        }
      >
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Aufgabe
        </Button>
      </PageHeader>
      {switcher}
      <PeriodPicker
        compact
        records={source}
        productions={productions}
        value={period}
        onChange={setPeriod}
      />
      {!mine && (
        <input
          className={styles.search}
          type="search"
          placeholder="Aufgaben suchen …"
          aria-label="Aufgaben suchen"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      <ErrorMessage message={error} />
      {groups.map((group) => {
        const groupOpen = mine ? group.tasks : group.tasks.filter(isOpenTask);
        const groupDone = group.tasks.length - groupOpen.length;
        const headingId = `task-group-${mode}-${group.id || "general"}`;
        return (
          <section key={group.id || "general"} className={styles.group} aria-labelledby={headingId}>
            <header className={styles.groupHeader}>
              <h2 id={headingId}>
                <span
                  className={styles.dot}
                  style={group.color ? { background: group.color } : undefined}
                  aria-hidden="true"
                />
                {group.title}
              </h2>
              <span className={styles.count}>
                {mine
                  ? groupOpen.length
                  : `${groupOpen.length} offen${groupDone ? ` · ${groupDone} erledigt` : ""}`}
              </span>
              {!mine && group.production && (
                <button
                  type="button"
                  className={styles.groupLink}
                  onClick={() =>
                    navigateWorkspace(
                      `/?${new URLSearchParams({ module: "productions", productionId: group.id, tab: "tasks" })}`,
                    )
                  }
                >
                  Zum Stück
                </button>
              )}
            </header>
            {groupOpen.length ? (
              <ul className={styles.list}>{groupOpen.map(row)}</ul>
            ) : (
              <p className={styles.groupEmpty}>Alles erledigt.</p>
            )}
          </section>
        );
      })}
      {!groups.length && (
        <div className={styles.empty} role="status">
          <h3>
            {query
              ? "Keine passenden Aufgaben"
              : mine
                ? done.length
                  ? "Alles erledigt."
                  : "Aktuell nichts offen."
                : "Noch keine Aufgaben in den Stücken."}
          </h3>
          <p className="small muted">
            {query
              ? "Passe die Suche oder die Spielzeit an."
              : mine
                ? "Neue Aufgaben, die dir zugeteilt werden, erscheinen hier."
                : "Aufgaben legt ihr im jeweiligen Stück unter Aufgaben an."}
          </p>
        </div>
      )}
      {mine && done.length > 0 && (
        <section className={styles.doneSection}>
          <button
            type="button"
            className={styles.doneToggle}
            aria-expanded={!doneCollapsed}
            onClick={() => setDoneCollapsed(!doneCollapsed)}
          >
            <ChevronRight size={17} aria-hidden="true" />
            Erledigt ({done.length})
          </button>
          {!doneCollapsed && (
            <>
              <ul className={styles.list}>{done.slice(0, doneLimit).map(row)}</ul>
              {done.length > doneLimit && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => setDoneLimit(done.length)}
                >
                  Alle {done.length} anzeigen
                </button>
              )}
            </>
          )}
        </section>
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {creating && (
        <ResourceEditor
          kind="tasks"
          defaults={{
            ...(period.season ? { season: period.season } : {}),
            ...(mine ? { assigneeIds: [userId] } : {}),
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}
