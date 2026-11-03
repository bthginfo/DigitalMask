import { describe, expect, it } from "vitest";
import type { DomainRecord, Member } from "@/shared/contracts";
import { calendarTimeAccounts, sortTimeAccounts } from "@/modules/calendar/time-accounts";

const member = (
  id: string,
  name: string,
  weeklyHours?: number,
  extra: Partial<Member> = {},
): Member => ({
  id,
  name,
  username: id,
  role: "user",
  status: "active",
  ...(weeklyHours !== undefined
    ? {
        preferences: {
          accentPalette: "green",
          onboardingVersion: 1,
          workingTime: {
            version: 1,
            openingBalanceSeconds: 0,
            schedules: [
              {
                effectiveFrom: "2026-10-26",
                weeklyMinutes: weeklyHours * 60,
                workingDays: [1, 2, 3, 4, 5, 6],
              },
            ],
          },
        },
      }
    : {}),
  ...extra,
});
const row = (id: string, kind: DomainRecord["kind"], data: DomainRecord["data"]) =>
  ({ id, kind, data }) as DomainRecord;
const user = member("admin", "Leitung", undefined, { role: "superadmin" });
const laura = member("laura", "Laura", 39);
const lena = member("lena", "Magdalena", 15);
const inputs = () => ({
  user,
  members: [
    lena,
    member("janine", "Janine"),
    laura,
    user,
    member("disabled", "Inaktiv", 39, { status: "disabled" }),
  ],
  attendance: [
    row("last-week", "attendance", {
      userId: "laura",
      date: "2026-10-26",
      durationSeconds: 41 * 3600,
    }),
    row("open-week", "attendance", {
      userId: "laura",
      date: "2026-11-02",
      durationSeconds: 20 * 3600,
    }),
    row("future", "attendance", {
      userId: "laura",
      date: "2026-11-04",
      durationSeconds: 100 * 3600,
    }),
    row("lena", "attendance", { userId: "lena", date: "2026-10-26", durationSeconds: 10 * 3600 }),
    row("project", "time", { userId: "laura", date: "2026-10-26", durationSeconds: 100 * 3600 }),
  ],
  events: [
    row("personal-holiday", "events", {
      category: "holiday",
      allDay: true,
      participantIds: ["lena"],
      start: "2026-11-01T00:00:00+01:00",
      end: "2026-11-02T00:00:00+01:00",
    }),
  ],
  calendarCategories: [
    row("holiday-category", "calendarCategories", {
      key: "holiday",
      name: "Feiertag",
      allDay: true,
    }),
  ],
  leave: [],
  now: new Date("2026-11-03T12:00:00+01:00"),
});

describe("calendar planning time accounts", () => {
  it("uses completed weekly balances, paid personal days and no future or project hours", () => {
    const result = calendarTimeAccounts(inputs());
    expect(result.through).toBe("2026-11-01");
    expect(result.accounts.map((account) => account.member.id)).toEqual([
      "laura",
      "janine",
      "lena",
    ]);
    expect(result.accounts[0]).toMatchObject({
      state: "ready",
      balanceSeconds: 2 * 3600,
      weeklySeconds: 39 * 3600,
    });
    expect(result.accounts[1]).toMatchObject({ state: "unconfigured" });
    expect(result.accounts[1].balanceSeconds).toBeUndefined();
    expect(result.accounts[2]).toMatchObject({
      state: "ready",
      balanceSeconds: -2.5 * 3600,
      weeklySeconds: 15 * 3600,
    });
  });
  it("keeps all accounts private for ordinary members, even if the caller supplies team data", () => {
    expect(calendarTimeAccounts({ ...inputs(), user: laura }).accounts).toEqual([]);
    expect(
      calendarTimeAccounts({ ...inputs(), user: { ...user, role: "admin" } }).accounts,
    ).toHaveLength(3);
  });
  it("includes start balances and the owner's freshest settings and handles future starts", () => {
    const own = member("laura", "Laura", 20, { role: "admin" });
    own.preferences!.workingTime!.openingBalanceSeconds = 3600;
    const future = member("future", "Später", 39);
    future.preferences!.workingTime!.schedules[0].effectiveFrom = "2026-11-09";
    const result = calendarTimeAccounts({ ...inputs(), user: own, members: [laura, future] });
    expect(result.accounts[0]).toMatchObject({
      balanceSeconds: 22 * 3600,
      weeklySeconds: 20 * 3600,
    });
    expect(result.accounts[1]).toMatchObject({ state: "future", availableFrom: "2026-11-09" });
    expect(result.accounts[1].balanceSeconds).toBeUndefined();
  });
  it("finishes Sunday's week immediately, matching the personal time account", () => {
    const result = calendarTimeAccounts({
      ...inputs(),
      now: new Date("2026-11-08T14:00:00+01:00"),
    });
    expect(result.through).toBe("2026-11-08");
    expect(result.accounts[0].balanceSeconds).toBe(83 * 3600);
  });
  it("sorts signed balances without modifying the canonical team order and keeps missing accounts last", () => {
    const { accounts } = calendarTimeAccounts(inputs());
    expect(sortTimeAccounts(accounts, "balance-asc").map((account) => account.member.id)).toEqual([
      "lena",
      "laura",
      "janine",
    ]);
    expect(sortTimeAccounts(accounts, "balance-desc").map((account) => account.member.id)).toEqual([
      "laura",
      "lena",
      "janine",
    ]);
    expect(sortTimeAccounts(accounts, "team")).toEqual(accounts);
    expect(accounts.map((account) => account.member.id)).toEqual(["laura", "janine", "lena"]);
  });
});
