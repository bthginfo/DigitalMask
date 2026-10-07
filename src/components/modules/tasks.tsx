"use client";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useViewState } from "@/shared/view-state";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Columns3,
  Flag,
  List,
  Plus,
} from "lucide-react";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import { initialPeriod, recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, ids, initials, value } from "@/shared/client-api";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { canManageRecord } from "@/shared/record-permissions";
import { ExportDialog } from "../export-dialog";
import { RecordLink } from "../record-link";
import { subscribeMobile, useStoredValue } from "@/shared/client-storage";
import styles from "./task-board.module.css";
const columns = [
  ["backlog", "Backlog"],
  ["todo", "Offen"],
  ["doing", "In Arbeit"],
  ["review", "Prüfung"],
  ["done", "Erledigt"],
];
const listColumns = [columns[1], columns[2], columns[3], columns[0], columns[4]];
function TaskListRow({
  task,
  onOpen,
  onMove,
}: {
  task: DomainRecord;
  onOpen: () => void;
  onMove: (status: string) => void;
}) {
  const { workspace } = useWorkspace();
  const canEdit = canManageRecord(workspace.user, "tasks", task);
  const checklist = Array.isArray(task.data.checklist)
    ? (task.data.checklist as { done: boolean }[])
    : [];
  const assignees = ids(task.data, "assigneeIds")
    .map((id) => workspace.members.find((person) => person.id === id)?.name)
    .filter(Boolean);
  return (
    <article className={styles.taskRow}>
      <button className={styles.openTask} onClick={onOpen}>
        <span className={styles.rowContent}>
          <strong>{value(task.data, "title")}</strong>
          {!!value(task.data, "description") && (
            <span className={styles.description}>{value(task.data, "description")}</span>
          )}
          <span className={styles.rowMeta}>
            {task.data.priority === "high" && (
              <span className={styles.highPriority}>
                <Flag size={12} /> Hoch
              </span>
            )}
            {!!task.data.due && (
              <span>
                <CalendarDays size={13} /> {dateLabel(value(task.data, "due"))}
              </span>
            )}
            {!!checklist.length && (
              <span>
                <CheckSquare size={13} /> {checklist.filter((item) => item.done).length}/
                {checklist.length}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={18} />
      </button>
      <footer className={styles.rowFooter}>
        <span className={styles.assignees}>{assignees.join(", ") || "Noch nicht zugeteilt"}</span>
        <label className={styles.rowStatus}>
          <span className="visually-hidden">Status von {value(task.data, "title")}</span>
          <select
            disabled={!canEdit}
            value={value(task.data, "status")}
            onChange={(event) => onMove(event.target.value)}
          >
            {columns.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </article>
  );
}
function TaskCard({
  task,
  onOpen,
  onMove,
}: {
  task: DomainRecord;
  onOpen: () => void;
  onMove: (status: string) => void;
}) {
  const { workspace } = useWorkspace();
  const canEdit = canManageRecord(workspace.user, "tasks", task);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canEdit,
  });
  const list = Array.isArray(task.data.checklist)
    ? (task.data.checklist as { done: boolean }[])
    : [];
  const subtasks = workspace.records.tasks.filter((x) => x.data.parentId === task.id);
  const production = workspace.records.productions.find((row) => row.id === task.data.productionId);
  return (
    <article
      className={`task-card ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined}
    >
      <div className="task-top">
        <span className="small muted">
          {production ? (
            <RecordLink record={production}>{value(production.data, "title")}</RecordLink>
          ) : (
            "Teamboard"
          )}
        </span>
        <button
          className="drag-handle"
          disabled={!canEdit}
          {...listeners}
          {...attributes}
          aria-label="Aufgabe verschieben"
        >
          ⠿
        </button>
      </div>
      <button className="task-title" onClick={onOpen}>
        {value(task.data, "title")}
      </button>
      <p className="small muted task-description">{value(task.data, "description")}</p>
      <div className="task-meta">
        {task.data.priority === "high" && (
          <Badge tone="coral">
            <Flag size={12} />
            Hoch
          </Badge>
        )}
        {!!task.data.due && (
          <span className="small">
            <CalendarDays size={13} />
            {dateLabel(value(task.data, "due"))}
          </span>
        )}
        {list.length > 0 && (
          <span className="small">
            <CheckSquare size={13} />
            {list.filter((x) => x.done).length}/{list.length}
          </span>
        )}
        {subtasks.length > 0 && <span className="small">{subtasks.length} Unteraufgaben</span>}
      </div>
      <footer className="task-footer">
        <div className="avatar-stack">
          {ids(task.data, "assigneeIds").map((id) => {
            const person = workspace.members.find((x) => x.id === id);
            return (
              <span key={id} className="avatar small-avatar" title={person?.name}>
                {initials(person?.name || "?")}
              </span>
            );
          })}
        </div>
        <label className="task-status-label">
          <span className="visually-hidden">Status von {value(task.data, "title")}</span>
          <select
            disabled={!canEdit}
            value={value(task.data, "status")}
            onChange={(e) => onMove(e.target.value)}
          >
            {columns.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </label>
      </footer>
    </article>
  );
}
function Column({
  id,
  label,
  tasks,
  onOpen,
  onMove,
  onAdd,
}: {
  id: string;
  label: string;
  tasks: DomainRecord[];
  onOpen: (record: DomainRecord) => void;
  onMove: (record: DomainRecord, status: string) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      data-column={id}
      className={`kanban-column ${isOver ? "drop-active" : ""}`}
    >
      <header>
        <h2>
          <span className={`status-dot ${id}`} />
          {label}
          <span className="count">{tasks.length}</span>
        </h2>
        <button className="icon-button" onClick={onAdd} aria-label={`Aufgabe in ${label} anlegen`}>
          <Plus size={16} />
        </button>
      </header>
      <div className="kanban-stack">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onOpen={() => onOpen(task)}
            onMove={(status) => onMove(task, status)}
          />
        ))}
        {!tasks.length && <div className="column-empty">Platz für eure nächsten Schritte.</div>}
      </div>
    </section>
  );
}
export function TasksModule({ productionId = "" }: { productionId?: string }) {
  const { workspace, save } = useWorkspace();
  const project = productionId;
  const scope = `tasks:${productionId || "team"}`;
  const [period, setPeriod] = useViewState<PeriodFilter>(workspace.user.id, scope, "period", () =>
    initialPeriod(workspace.records.productions, productionId),
  );
  const [sprint, setSprint] = useViewState(workspace.user.id, scope, "sprint", "");
  const [mine, setMine] = useViewState(workspace.user.id, scope, "mine", false);
  const [search, setSearch] = useViewState(workspace.user.id, scope, "search", "");
  const [status, setStatus] = useViewState(workspace.user.id, scope, "status", "");
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  const [preferredView, setView] = useStoredValue(
    `digitalmask-task-view:${workspace.user.id}:${isMobile ? "mobile" : "desktop"}`,
    isMobile ? "list" : "board",
  );
  const listView = preferredView === "list";
  const [editor, setEditor] = useState<{
    kind: "tasks" | "sprints";
    status?: string;
    parentId?: string;
  } | null>(null);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const filteredTasks = useMemo(
    () =>
      workspace.records.tasks.filter(
        (x) =>
          value(x.data, "productionId") === project &&
          recordMatchesPeriod(x, period, workspace.records.productions) &&
          (!sprint || x.data.sprintId === sprint) &&
          (!mine || ids(x.data, "assigneeIds").includes(workspace.user.id)) &&
          (!search || value(x.data, "title").toLowerCase().includes(search.toLowerCase())),
      ),
    [
      workspace.records.tasks,
      workspace.records.productions,
      workspace.user.id,
      project,
      period,
      sprint,
      mine,
      search,
    ],
  );
  const tasks = status
    ? filteredTasks.filter((task) => task.data.status === status)
    : filteredTasks;
  const move = async (task: DomainRecord, status: string) => {
    if (task.data.status === status) return;
    setError("");
    try {
      await save("tasks", { status }, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verschieben fehlgeschlagen");
    }
  };
  const dragEnd = (event: DragEndEvent) => {
    const task = tasks.find((x) => x.id === event.active.id);
    const status = String(event.over?.id || "");
    if (task && columns.some((x) => x[0] === status)) void move(task, status);
  };
  const selectedSprint = workspace.records.sprints.find((x) => x.id === sprint);
  return (
    <section className={styles.taskWorkspace}>
      <PageHeader
        compact
        eyebrow="GEMEINSAM VORAN"
        title={project ? "Aufgaben & Sprints" : "Teamboard"}
        description={
          project
            ? "Das Kanban und die Sprints dieser Produktion."
            : "Gemeinsame Aufgaben der Maske, unabhängig von einer Produktion."
        }
        secondaryActions={
          <>
            <ExportButton onClick={() => setExporting(true)} />
            {project && (
              <Button onClick={() => setEditor({ kind: "sprints" })}>Sprint planen</Button>
            )}
          </>
        }
      >
        <Button variant="primary" onClick={() => setEditor({ kind: "tasks" })}>
          <Plus size={16} />
          Aufgabe
        </Button>
      </PageHeader>
      <PeriodPicker
        compact
        records={workspace.records.tasks.filter(
          (row) => value(row.data, "productionId") === project,
        )}
        productions={workspace.records.productions}
        value={period}
        onChange={setPeriod}
      />
      <div className={`toolbar wrap ${styles.filters}`}>
        {project && (
          <select aria-label="Sprint" value={sprint} onChange={(e) => setSprint(e.target.value)}>
            <option value="">Alle Sprints</option>
            {workspace.records.sprints
              .filter((x) => x.data.productionId === project)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {value(x.data, "title")}
                </option>
              ))}
          </select>
        )}
        <input
          className={styles.search}
          placeholder="Aufgaben suchen …"
          aria-label="Aufgaben suchen"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="check-label">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Meine Aufgaben
        </label>
      </div>
      <div className={styles.viewToolbar}>
        <select
          aria-label="Aufgabenstatus filtern"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Alle Status ({filteredTasks.length})</option>
          {columns.map(([id, label]) => (
            <option key={id} value={id}>
              {label} ({filteredTasks.filter((task) => task.data.status === id).length})
            </option>
          ))}
        </select>
        <div className={`segmented ${styles.viewSwitch}`} role="group" aria-label="Aufgabenansicht">
          <button
            className={listView ? "active" : ""}
            aria-pressed={listView}
            onClick={() => setView("list")}
          >
            <List size={15} /> Liste
          </button>
          <button
            className={!listView ? "active" : ""}
            aria-pressed={!listView}
            onClick={() => setView("board")}
          >
            <Columns3 size={15} /> Kanban
          </button>
        </div>
      </div>
      {selectedSprint && (
        <div className="sprint-banner">
          <div>
            <p className="eyebrow">AKTUELLER SPRINT</p>
            <h3>{value(selectedSprint.data, "title")}</h3>
            <p className="small muted">{value(selectedSprint.data, "goal")}</p>
          </div>
          <span className="small">
            {dateLabel(value(selectedSprint.data, "start"))} –{" "}
            {dateLabel(value(selectedSprint.data, "end"))}
          </span>
          <Button onClick={() => setDetail(selectedSprint)}>Sprint bearbeiten</Button>
        </div>
      )}
      <ErrorMessage message={error} />
      {listView ? (
        <div className={styles.taskGroups}>
          {listColumns
            .filter(([id]) => tasks.some((task) => task.data.status === id))
            .map(([id, label]) => {
              const group = tasks.filter((task) => task.data.status === id);
              return (
                <section
                  key={id}
                  className={styles.taskGroup}
                  aria-label={`${label}: ${group.length} Aufgaben`}
                >
                  <header>
                    <h2>
                      <span className={`status-dot ${id}`} />
                      {label}
                      <span className="count">{group.length}</span>
                    </h2>
                    <button
                      className="icon-button"
                      aria-label={`Aufgabe in ${label} anlegen`}
                      onClick={() => setEditor({ kind: "tasks", status: id })}
                    >
                      <Plus size={17} />
                    </button>
                  </header>
                  {group.map((task) => (
                    <TaskListRow
                      key={task.id}
                      task={task}
                      onOpen={() => setDetail(task)}
                      onMove={(next) => void move(task, next)}
                    />
                  ))}
                </section>
              );
            })}
          {!tasks.length && (
            <div className={styles.noTasks} role="status">
              <h3>
                {search || mine || sprint || status
                  ? "Keine passenden Aufgaben"
                  : "Alles im Blick. Noch keine Aufgaben."}
              </h3>
              <p className="small muted">
                {search || mine || sprint || status
                  ? "Passe die Filter an oder lege eine neue Aufgabe an."
                  : "Mit einer Aufgabe beginnt euer nächster gemeinsamer Schritt."}
              </p>
              {(search || mine || sprint || status) && (
                <Button
                  onClick={() => {
                    setSearch("");
                    setMine(false);
                    setSprint("");
                    setStatus("");
                  }}
                >
                  Aufgabenfilter zurücksetzen
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {!status && (
            <div className="mobile-board-nav">
              <span className="small muted">Alle Spalten: horizontal wischen oder auswählen</span>
              <select
                aria-label="Kanban-Spalte anzeigen"
                defaultValue="backlog"
                onChange={(event) =>
                  board.current
                    ?.querySelector(`[data-column="${event.target.value}"]`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
                }
              >
                {columns.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label} ({tasks.filter((task) => task.data.status === id).length})
                  </option>
                ))}
              </select>
            </div>
          )}
          <DndContext sensors={sensors} onDragEnd={dragEnd}>
            <div
              className={`kanban ${styles.board}`}
              ref={(element) => {
                board.current = element;
              }}
            >
              {columns
                .filter(([id]) => !status || id === status)
                .map(([id, label]) => (
                  <Column
                    key={id}
                    id={id}
                    label={label}
                    tasks={tasks.filter((x) => x.data.status === id)}
                    onOpen={setDetail}
                    onMove={(task, status) => void move(task, status)}
                    onAdd={() => setEditor({ kind: "tasks", status: id })}
                  />
                ))}
            </div>
          </DndContext>
        </>
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {editor && (
        <ResourceEditor
          kind={editor.kind}
          lockedProductionId={project}
          defaults={{
            productionId: project,
            sprintId: sprint,
            season:
              period.season || initialPeriod(workspace.records.productions, productionId).season,
            ...(editor.status ? { status: editor.status } : {}),
            ...(editor.parentId
              ? {
                  parentId: editor.parentId,
                  productionId: workspace.records.tasks.find((x) => x.id === editor.parentId)?.data
                    .productionId,
                }
              : {}),
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {exporting && (
        <ExportDialog
          kind="tasks"
          filters={{
            ...periodExportFilters(period),
            ...(project ? { productionId: project } : { teamOnly: "true" }),
          }}
          onClose={() => setExporting(false)}
        />
      )}
    </section>
  );
}
