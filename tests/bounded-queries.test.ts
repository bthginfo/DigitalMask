import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";

vi.mock("@/platform/db", () => ({ db: {} }));
vi.mock("@/platform/events", () => ({
  auditChange: vi.fn(),
  emit: vi.fn(),
  scheduleEvents: vi.fn(),
}));
vi.mock("@/modules/records/workspace", () => ({ invalidateWorkspace: vi.fn() }));
import { dependencyReferences } from "@/modules/records/service";
import { eventWindowCondition, participantCondition } from "@/modules/calendar/window";
import { validateBooking } from "@/modules/time-tracking/validation";
import { assertProject } from "@/modules/records/repository";

const dialect = new PgDialect();
const render = (value: SQL | undefined) => (value ? dialect.sqlToQuery(value) : undefined);

describe("bounded record scans", () => {
  it("checks deletion dependencies only in kinds that can refer to the deleted kind", () => {
    const characters = render(dependencyReferences("characters", "character-1"))!;
    expect(characters.sql).toContain("->>$");
    expect(characters.params).toEqual([
      "casting",
      "looks",
      "materials",
      "characterId",
      "character-1",
    ]);
    expect(render(dependencyReferences("productions", "play"))!.sql).toBe(
      '"records"."production_id" = $1',
    );
    const actors = render(dependencyReferences("actors", "actor"))!;
    expect(actors.params).toContain("maskPlans");
    expect(actors.params).toContain("reservations");
    expect(render(dependencyReferences("events", "duty"))!.params).toContain("shiftSwaps");
    for (const kind of ["messages", "notifications", "time", "leave", "looks"] as const)
      expect(dependencyReferences(kind, "any")).toBeUndefined();
  });

  it("loads only events that can overlap the checked dates, plus open series", () => {
    const query = render(
      eventWindowCondition(new Date("2026-12-10T10:00:00Z"), new Date("2026-12-11T10:00:00Z")),
    )!;
    expect(query.params).toEqual([
      "events",
      "2026-12-12T10:00:00.000Z",
      "2026-12-09T10:00:00.000Z",
      "2026-12-09",
    ]);
    expect(query.sql).toContain('"records"."start_at" <');
    expect(query.sql).toContain('"records"."end_at" >');
    expect(query.sql).toContain("in ('daily','weekly')");
    expect(render(participantCondition(["a", "b", "a"]))).toMatchObject({
      sql: `"records"."data"->'participantIds' ?| array[$1, $2]::text[]`,
      params: ["a", "b"],
    });
    expect(render(participantCondition([]))!.sql).toBe("false");
  });

  it("bounds the booking overlap check below by the longest possible booking", async () => {
    const queries: SQL[] = [];
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({
          where: (where: SQL) => {
            queries.push(where);
            return { limit: async () => [] };
          },
        }),
      }),
    } as unknown as Transaction;
    await validateBooking(
      { departmentId: "makeup" } as Context,
      "time",
      { userId: "owner", start: "2026-12-10T08:00:00.000Z", end: "2026-12-10T16:00:00.000Z" },
      tx,
    );
    const query = render(queries[0])!;
    expect(query.params).toContain("2026-12-02T08:00:00.000Z");
    expect(query.sql.match(/"start_at" [<>]/g)).toHaveLength(2);
  });

  it("reads a production once per save, however often it is checked", async () => {
    let reads = 0;
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              reads++;
              return [{ id: "play", kind: "productions", data: { memberIds: [] } }];
            },
          }),
        }),
      }),
    } as unknown as Transaction;
    const context = { departmentId: "makeup", user: { id: "u", role: "user" } } as Context;
    const memo = new Map();
    await assertProject(context, "play", tx, memo);
    await assertProject(context, "play", tx, memo);
    await assertProject(context, "", tx, memo);
    expect(reads).toBe(1);
    await assertProject(context, "play", tx);
    expect(reads).toBe(2);
  });
});
