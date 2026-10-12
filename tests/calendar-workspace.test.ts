import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import { memberships, records } from "@/platform/db/schema";
import { recordKinds, type DomainRecord, type Workspace } from "@/shared/contracts";
import {
  calendarProductionRecords,
  calendarProductionReference,
  canEditCalendarEvent,
} from "@/shared/calendar-access";
import { calendarPresentation } from "@/shared/calendar-categories";
import { buildExport } from "@/modules/exports";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
  revalidateTag: vi.fn(),
}));
vi.mock("@/platform/context", () => ({ scopeTag: (id: string) => `workspace:${id}` }));
vi.mock("@/platform/realtime", () => ({ scheduleLiveChange: vi.fn() }));
import { getWorkspace } from "@/modules/records/workspace";

const context: Context = {
  organizationId: "fictional-theatre",
  organizationName: "Fiktives Theater",
  departmentId: "fictional-makeup",
  departmentName: "Maske",
  user: { id: "viewer", name: "Alex Beispiel", username: "alex", status: "active", role: "user" },
};
const row = (kind: DomainRecord["kind"], id: string, data: DomainRecord["data"]): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: context.organizationId,
  departmentId: context.departmentId,
  createdBy: "colleague",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-01T08:00:00Z",
  version: 1,
});
const production = row("productions", "closed-production", {
  title: "Fiktives Stück",
  color: "#aabbcc",
  season: "2026/27",
  premiere: "2026-11-01",
  memberIds: ["colleague"],
  description: "INTERNAL DESCRIPTION",
  contacts: [{ name: "PRIVATE CONTACT" }],
});
const event = row("events", "colleague-event", {
  productionId: production.id,
  title: "",
  category: "performance",
  start: "2026-10-12T18:00:00+02:00",
  end: "2026-10-12T20:00:00+02:00",
  participantIds: ["colleague"],
});
const scopeRows = [
  production,
  event,
  row("events", "own-event", {
    ...event.data,
    productionId: "",
    participantIds: [context.user.id],
  }),
  row("tasks", "private-task", { productionId: production.id, title: "PRIVATE TASK" }),
  row("messages", "private-production-message", {
    productionId: production.id,
    body: "PRIVATE MESSAGE",
  }),
  row("looks", "private-look", { productionId: production.id, status: "published" }),
  row("time", "private-time", {
    productionId: production.id,
    userId: "colleague",
    durationSeconds: 7200,
  }),
  row("conversations", "private-chat", { participantIds: ["colleague"], mode: "private" }),
  row("events", "private-chat-event", { ...event.data, conversationId: "private-chat" }),
  row("files", "private-file", { recordId: "private-task", path: "SECRET PATH" }),
  row("files", "calendar-file", { recordId: event.id, path: "PRIVATE BLOB PATH" }),
];
const queries: { sql: string; params: unknown[] }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      if (table === records)
        return {
          where: (where: SQL) => {
            queries.push(new PgDialect().sqlToQuery(where));
            return {
              orderBy: () =>
                Promise.resolve(
                  scopeRows.map((record) => ({
                    ...record,
                    createdAt: new Date(record.createdAt),
                    updatedAt: new Date(record.updatedAt),
                  })),
                ),
            };
          },
        };
      if (table === memberships) {
        const team = {
          innerJoin: () => team,
          leftJoin: () => team,
          where: () =>
            Promise.resolve([
              context.user,
              { ...context.user, id: "colleague", name: "Lena Muster" },
            ]),
        };
        return team;
      }
      return { where: () => ({ unionAll: () => Promise.resolve([]) }) };
    },
  }));
});

describe("department calendar sharing", () => {
  it("shares production events with a nonmember while protecting production contents and private chats", async () => {
    const workspace = await getWorkspace(context);
    expect(workspace.records.events.map((record) => record.id)).toEqual([event.id, "own-event"]);
    for (const kind of [
      "productions",
      "tasks",
      "messages",
      "looks",
      "time",
      "conversations",
    ] as const)
      expect(workspace.records[kind]).toEqual([]);
    expect(workspace.projectHours).toEqual({});
    expect(workspace.records.files.map((file) => file.id)).toEqual(["calendar-file"]);
    expect(JSON.stringify(workspace)).not.toMatch(/PRIVATE|INTERNAL|SECRET/);
    expect(workspace.calendarProductions?.[0].data).toEqual({
      title: "Fiktives Stück",
      color: "#aabbcc",
      season: "2026/27",
      premiere: "2026-11-01",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].params).toEqual([context.departmentId, "timesheets"]);
    // Sharing reuses the scope, team and timer reads; there is no separate calendar query.
    expect(mocks.select).toHaveBeenCalledTimes(4);
  });

  it("keeps member production access while leaving the shared calendar identical", async () => {
    const viewer = await getWorkspace(context);
    const member = await getWorkspace({ ...context, user: { ...context.user, id: "colleague" } });
    expect(member.records.productions.map((record) => record.id)).toEqual([production.id]);
    expect(member.records.tasks.map((record) => record.id)).toEqual(["private-task"]);
    expect(member.calendarProductions).toEqual(viewer.calendarProductions);
    expect(member.records.events.find((row) => row.id === event.id)).toEqual(
      viewer.records.events[0],
    );
  });

  it("keeps shared production labels and colors in presentation and calendar downloads", async () => {
    const workspace = await getWorkspace(context);
    const productions = calendarProductionRecords(workspace);
    const presentation = calendarPresentation(event, productions);
    expect(presentation).toMatchObject({ color: "#aabbcc", title: "Fiktives Stück – Vorstellung" });
    const result = await buildExport({
      kind: "events",
      format: "ics",
      records: [event],
      members: workspace.members,
      references: { ...workspace.records, productions },
      organization: context.organizationName,
      department: context.departmentName,
    });
    const exported = new TextDecoder().decode(result.bytes);
    expect(exported).toContain("Fiktives Stück");
    expect(exported).not.toMatch(/PRIVATE|INTERNAL|SECRET/);
  });

  it("treats the projection as display data and keeps event editing separate", () => {
    const workspace: Workspace = {
      user: context.user,
      members: [context.user],
      organization: { id: context.organizationId, name: context.organizationName },
      department: { id: context.departmentId, name: context.departmentName },
      records: Object.fromEntries(
        recordKinds.map((kind) => [kind, []]),
      ) as unknown as Workspace["records"],
      calendarProductions: [calendarProductionReference(production)],
      timer: null,
      projectHours: {},
    };
    const ownEvent = { ...event, data: { ...event.data, participantIds: [context.user.id] } };
    expect(canEditCalendarEvent(workspace, event)).toBe(false);
    expect(canEditCalendarEvent(workspace, ownEvent)).toBe(false);
    workspace.records.productions.push(production);
    expect(canEditCalendarEvent(workspace, ownEvent)).toBe(true);
    expect(canEditCalendarEvent(workspace, event)).toBe(false);
    workspace.user = { ...workspace.user, role: "admin" };
    expect(canEditCalendarEvent(workspace, event)).toBe(true);
    delete workspace.calendarProductions;
    expect(calendarProductionRecords(workspace)).toBe(workspace.records.productions);
  });
});
