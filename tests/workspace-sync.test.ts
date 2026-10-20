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
    expect(mergeWorkspaceUpdate(current, reduced)).toBe(reduced);
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
