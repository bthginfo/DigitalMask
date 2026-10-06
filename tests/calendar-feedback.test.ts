import { describe, expect, it } from "vitest";
import {
  calendarCategoryBehavior,
  calendarCategoryBlocksTime,
  calendarPresentation,
} from "../src/shared/calendar-categories";
import { calendarTeamLanes } from "../src/shared/calendar-team";
import { sortProductionsByPremiere } from "../src/shared/production-order";
import { memberDayEvents, teamCalendarMembers } from "../src/modules/exports/team-calendar";
import { buildIcs } from "../src/modules/exports/ical";
import type { DomainRecord, Member } from "../src/shared/contracts";
import type { ExportInput } from "../src/modules/exports/types";

const record = (
  id: string,
  data: DomainRecord["data"],
  kind: DomainRecord["kind"] = "events",
): DomainRecord => ({
  id,
  data,
  kind,
  organizationId: "fictional-theatre",
  departmentId: "fictional-makeup",
  createdBy: "fictional-laura",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-01T08:00:00Z",
  version: 1,
});
const member = (id: string, name: string, fields: Partial<Member> = {}): Member => ({
  id,
  name,
  username: id,
  status: "active",
  role: "user",
  ...fields,
});

describe("calendar working-time backgrounds and hints", () => {
  it("supports existing Dienst and explicit TD/Tagesdienst definitions without rewriting records", () => {
    for (const key of ["service", "TD", "tages-dienst"])
      expect(calendarCategoryBehavior(key, { blocksTime: true })).toMatchObject({
        background: "service",
        blocksTime: false,
      });
    const categories = [
      record(
        "named-service",
        { key: "custom", name: "TÁGESDIENST", blocksTime: true },
        "calendarCategories",
      ),
    ];
    expect(calendarCategoryBlocksTime("custom", categories)).toBe(false);
    expect(
      calendarPresentation(record("existing", { category: "custom" }), [], categories),
    ).toMatchObject({ background: "service", blocksTime: false });
    expect(categories[0].data.blocksTime).toBe(true);
  });
  it("keeps half-free-day hints nonblocking and preserves absence and foreground protection", () => {
    expect(calendarCategoryBehavior("half-day-off", { blocksTime: true })).toMatchObject({
      background: "hint",
      blocksTime: false,
    });
    for (const key of [
      "absence",
      "sick",
      "abf",
      "rest",
      "vacation",
      "rehearsal",
      "performance",
      "preparation",
      "custom",
    ])
      expect(calendarCategoryBehavior(key)).toMatchObject({
        background: undefined,
        blocksTime: true,
      });
    expect(calendarCategoryBehavior("rest", { name: "Dienst" }).blocksTime).toBe(true);
    expect(calendarCategoryBehavior("custom", { name: "Bereitschaftsdienst" }).blocksTime).toBe(
      true,
    );
  });
  it("exports working-time backgrounds and hints as transparent ICS entries", () => {
    const input: ExportInput = {
      kind: "events",
      format: "ics",
      organization: "Fiktiv",
      department: "Maske",
      members: [],
      records: ["service", "half-day-off", "vacation", "rehearsal"].map((category) =>
        record(category, {
          title: category,
          category,
          start: "2026-10-04T08:00:00Z",
          end: "2026-10-04T10:00:00Z",
        }),
      ),
    };
    const text = new TextDecoder().decode(buildIcs(input));
    for (const category of ["service", "half-day-off"])
      expect(
        text.split("BEGIN:VEVENT").find((entry) => entry.includes(`UID:${category}@`)),
      ).toContain("TRANSP:TRANSPARENT");
    for (const category of ["vacation", "rehearsal"])
      expect(
        text.split("BEGIN:VEVENT").find((entry) => entry.includes(`UID:${category}@`)),
      ).toContain("TRANSP:OPAQUE");
  });
});

describe("department lanes and production ordering", () => {
  const members = [
    member("z", "Zoe"),
    member("jj", "Julia John"),
    member("m", "Magdalena"),
    member("jg", "JULIA GOTTLOEBER"),
    member("j", "Janine"),
    member("k", "Katharina"),
    member("l", "Laura"),
    member("a", "Anne"),
    member("inactive", "Laura Ausgeschieden", { status: "disabled" }),
    member("root", "Superadmin", { role: "superadmin" }),
  ];
  it("uses the confirmed order with distinct Julias, deterministic extra staff and a final guest lane", () => {
    const lanes = calendarTeamLanes(members);
    expect(lanes.map((lane) => lane.id)).toEqual(["l", "k", "j", "jg", "jj", "m", "a", "z", ""]);
    expect(lanes.at(-1)?.name).toBe("Gäste/Aushilfen");
    expect(
      calendarTeamLanes([member("jg", "Julia Gottlöber"), member("jj", "Julia John")]).map(
        (lane) => lane.id,
      ),
    ).toEqual(["jg", "jj", ""]);
  });
  it("shares export lane order and protects personal exports from mixed unassigned records", () => {
    const guest = record("guest", {
      participantIds: [],
      start: "2026-10-04T08:00:00Z",
      end: "2026-10-04T10:00:00Z",
    });
    const input: ExportInput = {
      kind: "events",
      format: "pdf",
      records: [guest],
      members,
      organization: "Fiktiv",
      department: "Maske",
      from: "2026-10-04",
      to: "2026-10-04",
    };
    expect(teamCalendarMembers(input).map((lane) => lane.id)).toEqual(
      calendarTeamLanes(members).map((lane) => lane.id),
    );
    expect(teamCalendarMembers({ ...input, records: [] }).at(-1)?.name).toBe("Gäste/Aushilfen");
    expect(teamCalendarMembers({ ...input, userIds: ["l"] }).map((lane) => lane.id)).toEqual(["l"]);
    expect(memberDayEvents({ ...input, userIds: ["l"] }, "2026-10-04", "")).toEqual([]);
    expect(memberDayEvents(input, "2026-10-04", "")).toEqual([guest]);
  });
  it("uses the overview premiere order while preserving historical and undated choices", () => {
    const productions = [
      record("late", { premiere: "2026-11-24", title: "Später" }, "productions"),
      record("old", { premiere: "2025-01-01", title: "Archiv" }, "productions"),
      record("none", { title: "Ohne Datum" }, "productions"),
      record("soon", { premiere: "2026-10-12", title: "Nächste Premiere" }, "productions"),
      record("recent", { premiere: "2026-09-30", title: "Repertoire" }, "productions"),
    ];
    expect(sortProductionsByPremiere(productions, "2026-10-04").map((row) => row.id)).toEqual([
      "soon",
      "late",
      "recent",
      "old",
      "none",
    ]);
    expect(productions[0].id).toBe("late");
  });
});
