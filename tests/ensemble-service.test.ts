import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "../src/platform/context";
const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), transaction: vi.fn() },
  getEnsemble: vi.fn(),
  getProfile: vi.fn(),
  fetchTheatre: vi.fn(),
  invalidate: vi.fn(),
  audit: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  emit: vi.fn(),
  schedule: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("../src/platform/db", () => ({ db: mocks.db }));
vi.mock("../src/platform/context", () => ({
  requireAdmin: (context: Context) => {
    if (context.user.role === "user") throw Object.assign(new Error("Admins"), { status: 403 });
  },
}));
vi.mock("../src/modules/ensemble/source", () => ({
  getEnsemble: mocks.getEnsemble,
  getProfile: mocks.getProfile,
  fetchTheatre: mocks.fetchTheatre,
}));
vi.mock("../src/modules/records/workspace", () => ({ invalidateWorkspace: mocks.invalidate }));
vi.mock("../src/platform/events", () => ({
  auditChange: mocks.audit,
  emit: mocks.emit,
  scheduleEvents: mocks.schedule,
}));
vi.mock("../src/modules/files/portrait-analysis", () => ({ analyzePortrait: mocks.analyze }));
import { ensemblePreview, importEnsemble } from "../src/modules/ensemble/service";
const context = {
  departmentId: "maske",
  organizationId: "theatre",
  user: { id: "admin", role: "admin" },
} as Context;
const person = {
  sourceId: "2331",
  name: "Michael Amelung",
  sourceUrl:
    "https://theater.ingolstadt.de/ensemble/schauspielerinnen/schauspielerinnen-detailseite/2331.html",
  biography: "Bio",
  ensembleStatus: "",
  productions: [],
  imageUrl: "",
  imageCredit: "",
};
describe("ensemble authorization and transactional update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnsemble.mockResolvedValue([person]);
    mocks.getProfile.mockResolvedValue(person);
    mocks.analyze.mockResolvedValue({
      width: 2,
      height: 2,
      portraitFocus: { x: 0.5, y: 0.24, faceWidth: 0, faceHeight: 0, detected: false, version: 1 },
    });
  });
  it("denies members before contacting source or database", async () => {
    const member = { ...context, user: { ...context.user, role: "user" as const } };
    await expect(ensemblePreview(member)).rejects.toMatchObject({ status: 403 });
    await expect(importEnsemble(member, ["2331"])).rejects.toMatchObject({ status: 403 });
    expect(mocks.getEnsemble).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
  it("rejects invalid target seasons before scraping or opening the database", async () => {
    await expect(ensemblePreview(context, "2026/2028")).rejects.toThrow();
    await expect(importEnsemble(context, ["2331"], "2026/2028")).rejects.toThrow();
    expect(mocks.getEnsemble).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
  it("updates the same actor ID and leaves unrelated actors and casting links intact", async () => {
    const rows = [
      {
        id: "existing",
        version: 2,
        data: {
          name: "Michael Amelung",
          notes: "Lena",
          imageIds: ["own-photo"],
          ensembleSeasons: ["2022/2023"],
        },
      },
      { id: "extra", version: 1, data: { name: "Gast" } },
    ];
    mocks.db.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
    const updated: { id: string; data: unknown }[] = [];
    let select = 0;
    const ownPhoto = {
      id: "own-photo",
      kind: "files",
      data: { recordId: "existing", recordKind: "actors", image: true, mime: "image/webp" },
    };
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({
          where: () => ({
            for: () =>
              Promise.resolve(++select === 1 ? rows.map((row) => ({ ...row })) : [ownPhoto]),
          }),
        }),
      }),
      update: () => ({
        set: (values: { data: unknown }) => ({
          where: () => {
            updated.push({ id: "existing", data: values.data });
            return Promise.resolve();
          },
        }),
      }),
    };
    mocks.db.transaction.mockImplementation(async (callback) => callback(tx));
    const result = await importEnsemble(context, ["2331"], "2026 / 27");
    expect(result).toMatchObject({
      created: 0,
      updated: 1,
      images: 0,
      errors: [],
      season: "2026/2027",
    });
    expect(updated).toEqual([
      {
        id: "existing",
        data: expect.objectContaining({
          name: person.name,
          notes: "Lena",
          imageIds: ["own-photo"],
          sourceId: person.sourceId,
          ensembleSeasons: ["2026/2027", "2022/2023"],
        }),
      },
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(tx, context, "actors.ensemble-imported", "existing");
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(rows[1].data).toEqual({ name: "Gast" });
  });
  it("does not write or invalidate on an unchanged repeated import", async () => {
    const { validateRecord } = await import("../src/modules/records/schemas");
    const { importedActorData } = await import("../src/modules/ensemble/matching");
    const rows = [
      {
        id: "existing",
        version: 2,
        data: validateRecord("actors", importedActorData(person, {}, "2022/23")),
      },
    ];
    mocks.db.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
    const update = vi.fn();
    let select = 0;
    mocks.db.transaction.mockImplementation(async (callback) =>
      callback({
        execute: vi.fn(),
        select: () => ({
          from: () => ({
            where: () => ({ for: () => Promise.resolve(++select === 1 ? rows : []) }),
          }),
        }),
        update,
      }),
    );
    expect(await importEnsemble(context, ["2331"], "2022/2023")).toMatchObject({
      unchanged: 1,
      updated: 0,
      season: "2022/2023",
    });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("installs one private portrait and queues unreferenced previous pictures for deletion", async () => {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    const source = {
      ...person,
      imageUrl: "https://theater.ingolstadt.de/fileadmin/new.jpg",
      imageCredit: "Theater",
    };
    mocks.getProfile.mockResolvedValue(source);
    mocks.fetchTheatre.mockResolvedValue({ bytes, type: "image/png" });
    mocks.put.mockResolvedValue({});
    const rows = [
      {
        id: "existing",
        version: 2,
        data: {
          name: person.name,
          notes: "Lena",
          imageIds: ["manual", "old-import"],
          portraitFileId: "old-import",
          portraitSourceUrl: "old",
        },
      },
    ];
    mocks.db.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) });
    const files: { id: string; data: Record<string, unknown> }[] = [];
    let select = 0;
    const previous = [
      {
        id: "manual",
        kind: "files",
        data: {
          recordId: "existing",
          recordKind: "actors",
          image: true,
          mime: "image/webp",
          path: "manual-private-portrait",
        },
      },
      {
        id: "old-import",
        kind: "files",
        data: {
          recordId: "existing",
          recordKind: "actors",
          image: true,
          mime: "image/webp",
          path: "old-private-portrait",
        },
      },
    ];
    let actorData: Record<string, unknown> = {};
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => Promise.resolve(++select === 1 ? rows : [...previous, ...files]),
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
      insert: () => ({
        values: (value: (typeof files)[number]) => {
          files.push(value);
          return Promise.resolve();
        },
      }),
      delete: () => ({
        where: () => Promise.resolve(),
      }),
      update: () => ({
        set: (values: { data: Record<string, unknown> }) => ({
          where: () => {
            actorData = values.data;
            return Promise.resolve();
          },
        }),
      }),
    };
    mocks.db.transaction.mockImplementation(async (callback) => callback(tx));
    expect(await importEnsemble(context, [person.sourceId])).toMatchObject({
      updated: 1,
      images: 1,
      errors: [],
    });
    expect(files).toHaveLength(1);
    expect(files[0].data).toMatchObject({
      recordKind: "actors",
      recordId: "existing",
      mime: "image/webp",
      sourceUrl: source.imageUrl,
    });
    expect(actorData.imageIds).toEqual([files[0].id]);
    expect(actorData.notes).toBe("Lena");
    expect(mocks.put).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), {
      access: "private",
      contentType: "image/webp",
      addRandomSuffix: false,
    });
    expect(mocks.emit).toHaveBeenCalledWith(tx, context, "FileDeletionRequestedV1", {
      path: "old-private-portrait",
      fileId: "old-import",
    });
    expect(mocks.emit).toHaveBeenCalledWith(tx, context, "FileDeletionRequestedV1", {
      path: "manual-private-portrait",
      fileId: "manual",
    });
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("removes a staged private photo if its database transaction fails", async () => {
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    mocks.getProfile.mockResolvedValue({
      ...person,
      imageUrl: "https://theater.ingolstadt.de/fileadmin/new.jpg",
    });
    mocks.fetchTheatre.mockResolvedValue({ bytes, type: "image/png" });
    mocks.put.mockResolvedValue({});
    mocks.del.mockResolvedValue(undefined);
    mocks.db.select.mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    mocks.db.transaction.mockRejectedValue(new Error("Database unavailable"));
    await expect(importEnsemble(context, [person.sourceId])).rejects.toThrow(
      "Database unavailable",
    );
    expect(mocks.del).toHaveBeenCalledWith([mocks.put.mock.calls[0][0]]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
