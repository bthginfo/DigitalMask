import { describe, expect, it } from "vitest";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  checklistProgress,
  compareTasks,
  groupTasksByProduction,
  isOpenTask,
  isTaskOverdue,
  parseTaskView,
  sortDoneTasks,
  sprintsEnabled,
  statusAfterDrop,
  taskStatusGroup,
  taskStatusLabel,
  taskStatusOptions,
  taskStatusTag,
} from "@/modules/tasks/overview";
import { schemas } from "@/modules/records/schemas";

const record = (
  id: string,
  kind: DomainRecord["kind"],
  data: RecordData,
  updatedAt = "2026-11-01T08:00:00Z",
): DomainRecord => ({
  id,
  kind,
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  createdBy: "a",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt,
  version: 1,
  data,
});
const task = (id: string, data: RecordData, updatedAt?: string) =>
  record(id, "tasks", { title: id, status: "todo", ...data }, updatedAt);

describe("task status mapping", () => {
  it("maps legacy backlog and review into the three visible statuses", () => {
    expect(taskStatusGroup("backlog")).toBe("todo");
    expect(taskStatusGroup("todo")).toBe("todo");
    expect(taskStatusGroup("review")).toBe("doing");
    expect(taskStatusGroup("doing")).toBe("doing");
    expect(taskStatusGroup("done")).toBe("done");
    expect(taskStatusGroup(undefined)).toBe("todo");
    expect(taskStatusTag("backlog")).toBe("Später");
    expect(taskStatusTag("review")).toBe("Prüfen");
    expect(taskStatusTag("doing")).toBe("");
    expect(taskStatusLabel("backlog")).toBe("Offen · Später");
    expect(taskStatusLabel("review")).toBe("In Arbeit · Prüfen");
    expect(taskStatusLabel("done")).toBe("Erledigt");
  });

  it("offers three statuses for new tasks and keeps a legacy status selectable", () => {
    expect(taskStatusOptions().map(([id]) => id)).toEqual(["todo", "doing", "done"]);
    expect(taskStatusOptions("doing").map(([id]) => id)).toEqual(["todo", "doing", "done"]);
    expect(taskStatusOptions("backlog")).toEqual([
      ["todo", "Offen"],
      ["backlog", "Offen · Später"],
      ["doing", "In Arbeit"],
      ["done", "Erledigt"],
    ]);
    expect(taskStatusOptions("review").map(([id]) => id)).toEqual([
      "todo",
      "doing",
      "review",
      "done",
    ]);
  });

  it("keeps a legacy status when it is dropped into its own column", () => {
    expect(statusAfterDrop("backlog", "todo")).toBeNull();
    expect(statusAfterDrop("review", "doing")).toBeNull();
    expect(statusAfterDrop("todo", "todo")).toBeNull();
    expect(statusAfterDrop("backlog", "doing")).toBe("doing");
    expect(statusAfterDrop("review", "done")).toBe("done");
    expect(statusAfterDrop("todo", "review")).toBeNull();
    expect(statusAfterDrop("todo", "")).toBeNull();
  });

  it("treats backlog and review as open work", () => {
    expect(isOpenTask(task("a", { status: "backlog" }))).toBe(true);
    expect(isOpenTask(task("b", { status: "review" }))).toBe(true);
    expect(isOpenTask(task("c", { status: "done" }))).toBe(false);
  });

  it("still accepts legacy statuses in the stored schema", () => {
    for (const status of ["backlog", "todo", "doing", "review", "done"])
      expect(schemas.tasks.parse({ title: "Aufgabe", status })).toMatchObject({ status });
    expect(schemas.tasks.parse({ title: "Neu" })).toMatchObject({ status: "todo" });
  });
});

describe("task sorting and grouping", () => {
  const productions = [
    record("sturm", "productions", {
      title: "Der Sturm",
      color: "#3b6ea8",
      premiere: "2026-10-17",
    }),
    record("kabale", "productions", {
      title: "Kabale und Liebe",
      color: "#a8443b",
      premiere: "2026-09-01",
    }),
  ];

  it("sorts by due date first, undated last, then by priority and title", () => {
    const rows = [
      task("ohne-datum", { priority: "high" }),
      task("spaet", { due: "2026-12-01" }),
      task("frueh-normal", { due: "2026-11-20", priority: "normal" }),
      task("frueh-hoch", { due: "2026-11-20", priority: "high" }),
      task("frueh-niedrig", { due: "2026-11-20", priority: "low" }),
      task("ungueltig", { due: "später" }),
    ];
    expect(rows.sort(compareTasks).map((row) => row.id)).toEqual([
      "frueh-hoch",
      "frueh-normal",
      "frueh-niedrig",
      "spaet",
      "ohne-datum",
      "ungueltig",
    ]);
  });

  it("groups by Stück with general tasks under Allgemein, most urgent group first", () => {
    const groups = groupTasksByProduction(
      [
        task("team", { due: "2026-11-30" }),
        task("sturm-2", { productionId: "sturm", due: "2026-12-10" }),
        task("kabale", { productionId: "kabale", due: "2026-11-22" }),
        task("sturm-1", { productionId: "sturm", due: "2026-11-25" }),
      ],
      productions,
    );
    expect(groups.map((group) => [group.id, group.title, group.color])).toEqual([
      ["kabale", "Kabale und Liebe", "#a8443b"],
      ["sturm", "Der Sturm", "#3b6ea8"],
      ["", "Allgemein", ""],
    ]);
    expect(groups[1].tasks.map((row) => row.id)).toEqual(["sturm-1", "sturm-2"]);
  });

  it("orders the Alle Stücke overview like the production list", () => {
    const groups = groupTasksByProduction(
      [
        task("sturm", { productionId: "sturm", due: "2026-11-01" }),
        task("kabale", { productionId: "kabale", due: "2026-12-01" }),
        task("fremd", { productionId: "unbekannt" }),
      ],
      productions,
      "premiere",
    );
    expect(groups.map((group) => group.id)).toEqual(["kabale", "sturm", "unbekannt"]);
    expect(groups[2].title).toBe("Stück");
  });

  it("flags overdue open tasks and counts checklist progress", () => {
    const today = "2026-11-26";
    expect(isTaskOverdue(task("a", { due: "2026-11-25" }), today)).toBe(true);
    expect(isTaskOverdue(task("b", { due: "2026-11-26" }), today)).toBe(false);
    expect(isTaskOverdue(task("c", { due: "2026-11-25", status: "done" }), today)).toBe(false);
    expect(isTaskOverdue(task("d", {}), today)).toBe(false);
    expect(
      checklistProgress(
        task("e", {
          checklist: [
            { text: "Perücke", done: true },
            { text: "Bart", done: false },
          ],
        }),
      ),
    ).toEqual({ done: 1, total: 2 });
  });

  it("lists the most recently completed tasks first", () => {
    const rows = sortDoneTasks([
      task("alt", { status: "done" }, "2026-11-01T08:00:00Z"),
      task("neu", { status: "done" }, "2026-11-20T08:00:00Z"),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["neu", "alt"]);
  });
});

describe("optional sprints and Teamboard views", () => {
  const sprint = record("s1", "sprints", { title: "Sprint", productionId: "mit-sprint" });
  it("hides sprints until enabled, unless the production already has sprints", () => {
    expect(sprintsEnabled(undefined, [sprint])).toBe(false);
    expect(sprintsEnabled(record("neu", "productions", { title: "Neu" }), [sprint])).toBe(false);
    expect(sprintsEnabled(record("mit-sprint", "productions", { title: "Alt" }), [sprint])).toBe(
      true,
    );
    expect(
      sprintsEnabled(record("neu", "productions", { title: "Neu", sprintsEnabled: true }), [
        sprint,
      ]),
    ).toBe(true);
    expect(
      sprintsEnabled(record("mit-sprint", "productions", { title: "Alt", sprintsEnabled: false }), [
        sprint,
      ]),
    ).toBe(false);
  });

  it("stores the sprint switch on the production without forcing a default", () => {
    expect(schemas.productions.parse({ title: "Stück" })).not.toHaveProperty("sprintsEnabled");
    expect(schemas.productions.parse({ title: "Stück", sprintsEnabled: true })).toMatchObject({
      sprintsEnabled: true,
    });
    expect(() => schemas.productions.parse({ title: "Stück", sprintsEnabled: "ja" })).toThrow();
  });

  it("accepts only known Teamboard views from the URL", () => {
    expect(parseTaskView("mine")).toBe("mine");
    expect(parseTaskView("team")).toBe("team");
    expect(parseTaskView("productions")).toBe("productions");
    expect(parseTaskView("kanban")).toBeNull();
    expect(parseTaskView(null)).toBeNull();
  });
});
