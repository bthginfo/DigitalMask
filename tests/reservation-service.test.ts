import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
const mocks = vi.hoisted(() => ({ find: vi.fn(), project: vi.fn(), select: vi.fn() }));
vi.mock("@/platform/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/modules/records/repository", () => ({
  findRecord: mocks.find,
  assertProject: mocks.project,
}));
import {
  checkAvailability,
  validateMaterialCapacity,
  validateReservation,
} from "@/modules/reservations/service";

const context = {
  departmentId: "fictional-makeup",
  organizationId: "fictional-theatre",
  user: { id: "a", role: "user" },
} as Context;
const booking = {
  materialId: "wig",
  quantity: 1,
  start: "2030-10-20T08:00:00Z",
  end: "2030-10-20T16:00:00Z",
  status: "reserved",
  userId: "FORGED",
  productionId: "",
  actorId: "",
};
function fixture(capacity = 3) {
  const rows: { id: string; data: Record<string, unknown> }[] = [];
  const material = {
    id: "wig",
    kind: "materials",
    organizationId: context.organizationId,
    departmentId: context.departmentId,
    data: { name: "Fiktive Perücke", quantity: capacity },
  };
  mocks.find.mockImplementation(async (_context, id) =>
    id === "wig" ? material : rows.find((row) => row.id === id),
  );
  const select = () => ({ from: () => ({ where: () => Promise.resolve(rows) }) });
  mocks.select.mockImplementation(select);
  return { rows, material, tx: { select } as unknown as Transaction };
}
beforeEach(() => vi.clearAllMocks());

describe("reservation server validation", () => {
  it("uses all reservations for capacity while returning only a private count", async () => {
    const data = fixture(3);
    data.rows.push({
      id: "hidden",
      data: {
        ...booking,
        quantity: 2,
        userId: "b",
        productionId: "private",
        purpose: "PRIVATE PRODUCTION",
      },
    });
    const result = await checkAvailability(context, booking);
    expect(result).toEqual({ available: 1, sufficient: true });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    await validateReservation(context, { ...booking }, data.tx);
    await expect(
      validateReservation(context, { ...booking, quantity: 2 }, data.tx),
    ).rejects.toThrow("nur 1 verfügbar");
  });
  it("forces the creator or stored owner and never assumes one item for zero stock", async () => {
    const data = fixture(0);
    await expect(validateReservation(context, { ...booking }, data.tx)).rejects.toThrow(
      "nur 0 verfügbar",
    );
    data.material.data.quantity = 3;
    const forged = { ...booking };
    await validateReservation(context, forged, data.tx);
    expect(forged.userId).toBe("a");
    const existing: NonNullable<Parameters<typeof validateReservation>[4]> = {
      id: "edited",
      kind: "reservations",
      organizationId: context.organizationId,
      departmentId: context.departmentId,
      createdBy: "owner",
      ownerId: "owner",
      productionId: null,
      parentId: null,
      startAt: new Date(booking.start),
      endAt: new Date(booking.end),
      createdAt: new Date("2026-10-01T08:00:00Z"),
      updatedAt: new Date("2026-10-01T08:00:00Z"),
      version: 1,
      data: { ...booking, userId: "owner" },
    };
    const edit = { ...booking };
    await validateReservation(context, edit, data.tx, "edited", existing);
    expect(edit.userId).toBe("owner");
  });
  it("checks capacity reductions against the true future peak and ignores ended reservations", async () => {
    const data = fixture();
    data.rows.push(
      { id: "a", data: { ...booking, quantity: 2, end: "2030-10-20T10:00:00Z" } },
      { id: "b", data: { ...booking, quantity: 2, start: "2030-10-20T10:00:00Z" } },
      {
        id: "old",
        data: {
          ...booking,
          quantity: 10,
          start: "2020-01-01T08:00:00Z",
          end: "2020-01-01T18:00:00Z",
        },
      },
    );
    await validateMaterialCapacity(context, { quantity: 2 }, data.tx, "wig");
    await expect(
      validateMaterialCapacity(context, { quantity: 1 }, data.tx, "wig"),
    ).rejects.toThrow("zeitweise 2 reserviert");
  });
  it("enforces department/project access before exposing availability and edit exclusions", async () => {
    const data = fixture();
    data.material.organizationId = "other-theatre";
    await expect(checkAvailability(context, booking)).rejects.toThrow("nicht gefunden");
    data.material.organizationId = context.organizationId;
    data.rows.push({ id: "other", data: { ...booking, materialId: "wig", userId: "b" } });
    await expect(checkAvailability(context, { ...booking, excludeId: "other" })).rejects.toThrow(
      "eigene Reservierung",
    );
  });
});
