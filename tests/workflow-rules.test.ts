import { describe, expect, it } from "vitest";
import type { DomainRecord } from "@/shared/contracts";
import { canManageRecord } from "@/shared/record-permissions";
import { reservationSchema, availabilitySchema } from "@/modules/reservations/schema";
import { availableQuantity, peakReservedQuantity } from "@/modules/reservations/rules";
import { createShiftSwapSchema } from "@/modules/shift-swaps/schema";
import {
  findSwapConflict,
  selectedSwapOccurrence,
  shiftSwapTransition,
  replacementParticipants,
} from "@/modules/shift-swaps/rules";
import { exportRows, columnsFor } from "@/modules/exports/data";
import { workflowMatchesExportPeriod } from "@/modules/workflows/export-period";

const at = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00Z`;
const reservation = (
  id: string,
  start: number,
  end: number,
  quantity: number,
  status = "reserved",
) => ({ id, data: { materialId: "wig", start: at(start), end: at(end), quantity, status } });
const row = (
  id: string,
  data: DomainRecord["data"],
  kind: DomainRecord["kind"] = "events",
): DomainRecord => ({
  id,
  kind,
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  createdBy: "a",
  createdAt: "2026-10-01T08:00:00Z",
  updatedAt: "2026-10-01T08:00:00Z",
  version: 1,
  data: {
    start: at(8),
    end: at(16),
    category: "service",
    allDay: false,
    recurrence: "none",
    participantIds: ["a"],
    ...data,
  },
});
const now = Date.parse("2026-10-07T08:00:00Z");

describe("article reservations", () => {
  it("uses concurrent capacity rather than summing disjoint overlaps", () => {
    const rows = [reservation("morning", 8, 10, 2), reservation("evening", 12, 16, 3)];
    expect(peakReservedQuantity(rows)).toBe(3);
    expect(availableQuantity(4, rows, at(8), at(16))).toBe(1);
  });
  it("treats adjacent intervals as half-open, skips cancelled and excludes only the edited record", () => {
    const rows = [
      reservation("a", 8, 10, 2),
      reservation("b", 10, 12, 2),
      reservation("cancelled", 8, 12, 9, "cancelled"),
    ];
    expect(peakReservedQuantity(rows)).toBe(2);
    expect(availableQuantity(2, rows, at(10), at(12), "b")).toBe(2);
    expect(availableQuantity(0, [], at(8), at(10))).toBe(0);
  });
  it("finds true simultaneous peaks and only counts ongoing/future stock commitments", () => {
    const rows = [
      reservation("a", 8, 11, 2),
      reservation("b", 10, 12, 1.5),
      reservation("c", 11, 16, 1),
    ];
    expect(peakReservedQuantity(rows)).toBe(3.5);
    expect(peakReservedQuantity(rows, Date.parse(at(12)))).toBe(1);
  });
  it("requires a real material, positive quantity and valid increasing instants", () => {
    const valid = { materialId: "wig", quantity: 1, start: at(8), end: at(10) };
    expect(reservationSchema.parse(valid).status).toBe("reserved");
    for (const invalid of [
      { materialId: "" },
      { quantity: 0 },
      { end: at(8) },
      { start: "invalid" },
    ])
      expect(reservationSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
    expect(availabilitySchema.safeParse({ ...valid, end: at(8) }).success).toBe(false);
  });
  it("protects other people's reservations and never grants generic swap status editing", () => {
    const record = { createdBy: "a", data: { userId: "a" } };
    expect(canManageRecord({ id: "a", role: "user" }, "reservations", record)).toBe(true);
    expect(canManageRecord({ id: "b", role: "user" }, "reservations", record)).toBe(false);
    expect(canManageRecord({ id: "b", role: "admin" }, "reservations", record)).toBe(true);
    expect(canManageRecord({ id: "admin", role: "admin" }, "shiftSwaps", record)).toBe(false);
  });
});

describe("shift-swap consent and calendar rules", () => {
  const pending = { requesterId: "a", partnerId: "b", status: "awaiting_partner" };
  it("requires explicit requester confirmation and a full reciprocal service", () => {
    const request = {
      serviceId: "service",
      serviceStart: at(8),
      serviceVersion: 1,
      partnerId: "b",
      confirmed: true,
    };
    expect(createShiftSwapSchema.safeParse(request).success).toBe(true);
    expect(createShiftSwapSchema.safeParse({ ...request, confirmed: false }).success).toBe(false);
    expect(createShiftSwapSchema.safeParse({ ...request, counterServiceId: "other" }).success).toBe(
      false,
    );
  });
  it("allows only the named colleague to consent and an admin only after consent", () => {
    expect(shiftSwapTransition({ id: "b", role: "user" }, pending, "accept")).toBe(
      "awaiting_admin",
    );
    expect(() => shiftSwapTransition({ id: "a", role: "user" }, pending, "accept")).toThrow(
      "angefragte Person",
    );
    expect(() => shiftSwapTransition({ id: "admin", role: "admin" }, pending, "approve")).toThrow(
      "Zuerst",
    );
    const accepted = { ...pending, status: "awaiting_admin" };
    expect(() => shiftSwapTransition({ id: "b", role: "user" }, accepted, "approve")).toThrow(
      "Admins",
    );
    expect(shiftSwapTransition({ id: "admin", role: "admin" }, accepted, "approve")).toBe(
      "approved",
    );
    expect(() =>
      shiftSwapTransition(
        { id: "a", role: "user" },
        { ...pending, status: "approved" },
        "withdraw",
      ),
    ).toThrow("abgeschlossen");
  });
  it("selects a real future occurrence, rejects exceptions, past times and absence swaps", () => {
    const service = row("series", {
      start: "2026-10-13T07:00:00Z",
      end: "2026-10-13T15:00:00Z",
      recurrence: "weekly",
      until: "2026-11-30",
      exceptions: ["2026-10-27"],
    });
    expect(
      selectedSwapOccurrence(service, "2026-10-20T07:00:00Z", "a", [], now).end.toISOString(),
    ).toBe("2026-10-20T15:00:00.000Z");
    expect(() => selectedSwapOccurrence(service, "2026-10-27T08:00:00Z", "a", [], now)).toThrow(
      "nicht mehr statt",
    );
    expect(() =>
      selectedSwapOccurrence(row("past", {}), at(8), "a", [], Date.parse(at(9))),
    ).toThrow("zukünftige");
    expect(() =>
      selectedSwapOccurrence(row("absence", { allDay: true }), at(8), "a", [], now),
    ).toThrow("Abwesenheiten");
    expect(() =>
      replacementParticipants(row("shared", { participantIds: ["a", "b"] }), "a", "b"),
    ).toThrow("Personen");
  });
  it("blocks incoming service overlaps and all-day absences even over background duties", () => {
    const proposed = row("mine", {});
    const transfer = {
      event: proposed,
      start: new Date(at(8)),
      end: new Date(at(16)),
      outgoingId: "a",
      incomingId: "b",
    };
    expect(
      findSwapConflict(
        [transfer],
        [row("their-duty", { participantIds: ["b"], start: at(12), end: at(18) })],
        [],
      )?.eventId,
    ).toBe("their-duty");
    expect(
      findSwapConflict(
        [transfer],
        [
          row("leave", {
            participantIds: ["b"],
            category: "vacation",
            allDay: true,
            start: "2026-10-19T22:00:00Z",
            end: "2026-10-20T22:00:00Z",
          }),
        ],
        [],
      )?.eventId,
    ).toBe("leave");
    expect(
      findSwapConflict(
        [transfer],
        [
          row("appointment", {
            participantIds: ["b"],
            category: "rehearsal",
            start: at(10),
            end: at(11),
          }),
        ],
        [],
      ),
    ).toBeUndefined();
  });
  it("replaces only the reciprocal occurrence, preserving all other series conflicts", () => {
    const mine = row("mine", {}),
      theirs = row("theirs", { participantIds: ["b"] });
    const moves = [
      {
        event: mine,
        start: new Date(at(8)),
        end: new Date(at(16)),
        outgoingId: "a",
        incomingId: "b",
      },
      {
        event: theirs,
        start: new Date(at(8)),
        end: new Date(at(16)),
        outgoingId: "b",
        incomingId: "a",
      },
    ];
    expect(findSwapConflict(moves, [mine, theirs], [])).toBeUndefined();
    expect(
      findSwapConflict(moves, [mine, theirs, row("extra", { participantIds: ["a"] })], [])?.eventId,
    ).toBe("extra");
  });
});

describe("workflow export contents", () => {
  it("exports article names, actual dates, quantities and people rather than raw IDs", () => {
    const record = row(
      "reservation",
      {
        materialId: "wig",
        quantity: 2,
        purpose: "Anprobe",
        productionId: "production",
        userId: "a",
        status: "reserved",
      },
      "reservations",
    );
    const input = {
      kind: "reservations",
      format: "csv" as const,
      records: [record],
      members: [
        {
          id: "a",
          name: "Fiktive Maske",
          username: "a",
          role: "user" as const,
          status: "active" as const,
        },
      ],
      organization: "Fiktives Theater",
      department: "Maske",
      references: {
        materials: [row("wig", { name: "Perücke 1" }, "materials")],
        productions: [row("production", { title: "Fiktives Stück" }, "productions")],
      },
    };
    const exported = exportRows(input)[0];
    expect(exported.values.title).toBe("Perücke 1 · Anprobe");
    expect(exported.values.person).toBe("Fiktive Maske");
    expect(exported.values.quantity).toBe(2);
    expect(columnsFor("reservations").map((col) => col.key)).toContain("quantity");
    expect(workflowMatchesExportPeriod(record, "2026-10-20", "2026-10-20")).toBe(true);
    expect(workflowMatchesExportPeriod(record, "2026-10-21", "2026-10-21")).toBe(false);
  });
});
