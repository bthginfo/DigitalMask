"use client";
import { useRef, useState } from "react";
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
import { CalendarDays, CheckSquare, ChevronDown, Flag, Plus } from "lucide-react";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import { recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, ids, initials, value } from "@/shared/client-api";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { canManageRecord } from "@/shared/record-permissions";
import { ExportDialog } from "../export-dialog";
const columns = [
  ["backlog", "Backlog"],
  ["todo", "Offen"],
  ["doing", "In Arbeit"],
  ["review", "Prüfung"],
  ["done", "Erledigt"],
];
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
  return (
    <article
      className={`task-card ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined}
    >
      <div className="task-top">
        <span className="small muted">
          {(workspace.records.productions.find((x) => x.id === task.data.productionId)?.data
            .title as string) || "Teamboard"}
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
  const [period, setPeriod] = useState<PeriodFilter>({});
  const [sprint, setSprint] = useState("");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
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
  const tasks = workspace.records.tasks.filter(
    (x) =>
      value(x.data, "productionId") === project &&
      recordMatchesPeriod(x, period, workspace.records.productions) &&
      (!sprint || x.data.sprintId === sprint) &&
      (!mine || ids(x.data, "assigneeIds").includes(workspace.user.id)) &&
      (!search || value(x.data, "title").toLowerCase().includes(search.toLowerCase())),
  );
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
    <>
      <PageHeader
        eyebrow="GEMEINSAM VORAN"
        title={project ? "Aufgaben & Sprints" : "Teamboard"}
        description={
          project
            ? "Das Kanban und die Sprints dieser Produktion."
            : "Gemeinsame Aufgaben der Maske, unabhängig von einer Produktion."
        }
      >
        <ExportButton onClick={() => setExporting(true)} />
        {project && <Button onClick={() => setEditor({ kind: "sprints" })}>Sprint planen</Button>}
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
      <div className="toolbar wrap">
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
              {label}
            </option>
          ))}
        </select>
      </div>
      <DndContext sensors={sensors} onDragEnd={dragEnd}>
        <div
          className="kanban"
          ref={(element) => {
            board.current = element;
          }}
        >
          {columns.map(([id, label]) => (
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
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {editor && (
        <ResourceEditor
          kind={editor.kind}
          lockedProductionId={project}
          defaults={{
            productionId: project,
            sprintId: sprint,
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
    </>
  );
}
