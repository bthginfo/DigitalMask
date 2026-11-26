import { describe, expect, it } from "vitest";
import { recordKinds, type DomainRecord, type Workspace } from "@/shared/contracts";
import {
  mergeWorkspaceUpdate,
  parseLiveKinds,
  partialWorkspaceKinds,
  workspaceGroups,
  workspacePatch,
} from "@/shared/workspace-sync";

describe("incremental workspace delivery", () => {
  const record = (kind: DomainRecord["kind"], id: string) =>
    ({ id, kind, data: {} }) as DomainRecord;
  const current = {
    user: { id: "viewer", name: "Example", username: "viewer", role: "user", status: "active" },
    members: [],
    live: null,
    organization: { id: "theatre", name: "Theatre" },
    department: { id: "makeup", name: "Makeup" },
    timer: null,
    attendanceTimer: null,
    projectHours: { production: 3600 },
    records: Object.fromEntries(
      recordKinds.map((kind) => [kind, [record(kind, `old-${kind}`)]]),
    ) as Workspace["records"],
    calendarProductions: [record("productions", "production")],
    productionOverview: [record("productions", "other-production")],
  } as Workspace;

  it("replaces the complete changed slice, preserves unrelated data, and removes read notices", () => {
    const snapshot = { ...current, records: { ...current.records, notifications: [] } };
    const patch = workspacePatch(snapshot, ["notifications"]);
    expect(Object.keys(patch.records)).toEqual(["notifications"]);
    const merged = mergeWorkspaceUpdate(current, patch);
    expect(merged.records.notifications).toEqual([]);
    expect(merged.records.events).toBe(current.records.events);
    expect(merged.calendarProductions).toBe(current.calendarProductions);
    expect(merged.productionOverview).toBe(current.productionOverview);
    expect(merged.projectHours).toEqual({ production: 3600 });
  });

  it("updates time summaries with time changes while keeping other slices", () => {
    const snapshot = {
      ...current,
      projectHours: { production: 7200 },
      timer: { id: "timer", data: {} },
    };
    const merged = mergeWorkspaceUpdate(current, workspacePatch(snapshot, ["time"]));
    expect(merged.projectHours).toEqual({ production: 7200 });
    expect(merged.timer?.id).toBe("timer");
    expect(merged.records.actors).toBe(current.records.actors);
  });

  it("fully replaces a snapshot when production or chat permissions may have changed", () => {
    expect(partialWorkspaceKinds(["productions"])).toBeUndefined();
    expect(partialWorkspaceKinds(["conversations"])).toBeUndefined();
    expect(partialWorkspaceKinds(["files"])).toBeUndefined();
    expect(partialWorkspaceKinds(["messages", "messages"])).toEqual(["messages"]);
    const reduced = { ...current, records: { ...current.records, messages: [] } };
    const merged = mergeWorkspaceUpdate(current, reduced);
    expect(merged).toEqual(reduced);
    expect(merged.records.messages).toEqual([]);
    expect(merged.records.events).toBe(current.records.events);
  });

  it("keeps unchanged users, members and records by identity so memoized views can skip work", () => {
    const versioned = (kind: DomainRecord["kind"], id: string, version = 1) =>
      ({ id, kind, version, updatedAt: `v${version}`, data: { id } }) as unknown as DomainRecord;
    const base = {
      ...current,
      members: [{ ...current.user }],
      records: {
        ...current.records,
        events: [versioned("events", "a"), versioned("events", "b")],
        messages: [versioned("messages", "m1")],
      },
    } as Workspace;
    const patch = workspacePatch(
      {
        ...base,
        user: { ...base.user },
        members: base.members.map((member) => ({ ...member })),
        records: {
          ...base.records,
          events: [versioned("events", "a"), versioned("events", "b")],
          messages: [versioned("messages", "m1"), versioned("messages", "m2")],
        },
      },
      ["events", "messages"],
    );
    const merged = mergeWorkspaceUpdate(base, patch);
    expect(merged.user).toBe(base.user);
    expect(merged.members).toBe(base.members);
    expect(merged.records.events).toBe(base.records.events);
    expect(merged.records.messages).not.toBe(base.records.messages);
    expect(merged.records.messages[0]).toBe(base.records.messages[0]);
    expect(merged.records.messages).toHaveLength(2);

    const edited = mergeWorkspaceUpdate(
      merged,
      workspacePatch(
        {
          ...merged,
          records: {
            ...merged.records,
            events: [versioned("events", "a", 2), versioned("events", "b")],
          },
        },
        ["events"],
      ),
    );
    expect(edited.records.events).not.toBe(merged.records.events);
    expect(edited.records.events[0].version).toBe(2);
    expect(edited.records.events[1]).toBe(merged.records.events[1]);
    expect(edited.records.messages).toBe(merged.records.messages);

    // Notices can be marked read without a new version and are always taken as sent.
    const notice = versioned("notifications", "n1");
    const withNotice = { ...base, records: { ...base.records, notifications: [notice] } };
    const read = { ...notice, data: { ...notice.data, read: true } };
    const afterRead = mergeWorkspaceUpdate(
      withNotice,
      workspacePatch({ ...withNotice, records: { ...withNotice.records, notifications: [read] } }, [
        "notifications",
      ]),
    );
    expect(afterRead.records.notifications[0].data.read).toBe(true);
  });

  it("handles old or malformed live payloads as a safe full refresh", () => {
    expect(parseLiveKinds(undefined)).toBeUndefined();
    expect(parseLiveKinds(["unknown"])).toBeUndefined();
    expect(parseLiveKinds(["events", "events"])).toEqual(["events"]);
    expect(() => mergeWorkspaceUpdate(null, workspacePatch(current, ["events"]))).toThrow();
  });

  it("covers every shared kind exactly once, excluding personal notices and unused timesheets", () => {
    const grouped = Object.values(workspaceGroups).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(
      recordKinds.filter((kind) => !["notifications", "timesheets"].includes(kind)).sort(),
    );
  });
});
