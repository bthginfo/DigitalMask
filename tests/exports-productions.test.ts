import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import sharp from "sharp";
import { buildExport, selectExportRecords } from "../src/modules/exports";
import type { DomainRecord, Member } from "../src/shared/contracts";
import type { ExportInput } from "../src/modules/exports/types";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const member: Member = {
  id: "member-private-id",
  name: "Klara Weiß",
  username: "klara",
  role: "user",
  status: "active",
};
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
): DomainRecord => ({
  id,
  kind,
  data,
  organizationId: "org",
  departmentId: "dept",
  createdBy: member.id,
  createdAt: "2026-09-30T08:00:00Z",
  updatedAt: "2026-09-30T08:00:00Z",
  version: 1,
});
const input = (
  kind: string,
  format: ExportInput["format"],
  records: DomainRecord[],
): ExportInput => ({
  kind,
  format,
  records,
  members: [member],
  organization: "Fiktives Testtheater",
  department: "Maske",
});
const production = record("productions", "p1", {
  title: "Der Zauberwald",
  season: "2026/27",
  status: "active",
  contacts: [
    {
      id: "makeup",
      role: "Leitung Maske",
      type: "makeup",
      name: "Veralteter Anzeigename",
      memberId: member.id,
    },
    {
      id: "external",
      role: "Regie / externe künstlerische Leitung",
      type: "external",
      name: "Änne Müller (Testperson)",
      memberId: "",
    },
  ],
});

async function inspectPdf(bytes: Uint8Array, prefix: string) {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const imageOps = new Set(
    Object.entries(OPS)
      .filter(([name]) => name.startsWith("paintImage") || name.includes("ImageMask"))
      .map(([, id]) => id),
  );
  const texts: string[] = [];
  let images = 0;
  const raster = process.env.EXPORT_RENDER_QA === "1",
    directory = path.join(process.cwd(), "artifacts", "exports");
  if (raster) {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${prefix}.pdf`), bytes);
  }
  for (let p = 1; p <= document.numPages; p++) {
    const page = await document.getPage(p),
      viewport = page.getViewport({ scale: 1.4 });
    const content = await page.getTextContent(),
      text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    texts.push(text);
    expect(text).toContain(`Seite ${p} von ${document.numPages}`);
    for (const item of content.items)
      if ("str" in item && item.str.trim()) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(-1);
        expect(item.transform[5]).toBeGreaterThanOrEqual(-1);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width / 1.4 + 1);
        expect(item.transform[5]).toBeLessThanOrEqual(viewport.height / 1.4 + 1);
      }
    const operators = await page.getOperatorList();
    images += operators.fnArray.filter((fn) => imageOps.has(fn)).length;
    if (raster) {
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext("2d") as never,
        viewport,
        canvas: canvas as never,
      }).promise;
      await writeFile(path.join(directory, `${prefix}-${p}.png`), canvas.toBuffer("image/png"));
    }
  }
  const pages = document.numPages;
  await document.cleanup();
  return { text: texts.join(" "), pages, images };
}

describe("production contacts and separated Teamboard exports", () => {
  it("resolves makeup members and preserves external names in CSV, XLSX and JSON", async () => {
    const csv = new TextDecoder().decode(
      (await buildExport(input("productions", "csv", [production]))).bytes,
    );
    expect(csv).toContain("Leitung Maske: Klara Weiß (Maske)");
    expect(csv).toContain("Änne Müller (Testperson) (Extern)");
    expect(csv).not.toContain("Veralteter Anzeigename");
    expect(csv).not.toContain(member.id);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array((await buildExport(input("productions", "xlsx", [production]))).bytes).buffer,
    );
    expect(workbook.getWorksheet("Daten")!.getCell("G4").value).toBe("Zuständigkeiten / Kontakte");
    expect(workbook.getWorksheet("Daten")!.getCell("G5").value).toContain("Klara Weiß");
    const payload = JSON.parse(
      new TextDecoder().decode(
        (await buildExport(input("productions", "json", [production]))).bytes,
      ),
    );
    expect(payload.records[0].data.contacts).toEqual(production.data.contacts);
    expect(
      payload.contactDirectory[0].contacts.map((contact: { name: string }) => contact.name),
    ).toEqual(["Klara Weiß", "Änne Müller (Testperson)"]);
  });
  it("separates Teamboard and production tasks in every downloadable format", async () => {
    const records = [
      record("tasks", "team", { title: "TEAM_MARKER", productionId: "" }),
      record("tasks", "team-missing", { title: "TEAM_WITHOUT_PROJECT" }),
      record("tasks", "project", { title: "PROJECT_MARKER", productionId: "p1" }),
      record("tasks", "other-project", { title: "OTHER_PROJECT", productionId: "p2" }),
    ];
    expect(
      selectExportRecords({ kind: "tasks", records, teamOnly: true }).map((r) => r.id),
    ).toEqual(["team", "team-missing"]);
    expect(
      selectExportRecords({ kind: "tasks", records, productionId: "p1" }).map((r) => r.id),
    ).toEqual(["project"]);
    for (const format of ["csv", "json", "xlsx"] as const) {
      const team = await buildExport({ ...input("tasks", format, records), teamOnly: true });
      const project = await buildExport({ ...input("tasks", format, records), productionId: "p1" });
      const extract = async (bytes: Uint8Array) => {
        if (format !== "xlsx") return new TextDecoder().decode(bytes);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(new Uint8Array(bytes).buffer);
        return workbook.getWorksheet("Daten")!.getSheetValues().flat().join(" ");
      };
      const teamText = await extract(team.bytes),
        projectText = await extract(project.bytes);
      expect(team.filename).toContain("teamboard");
      expect(teamText).toContain("TEAM_MARKER");
      expect(teamText).not.toContain("PROJECT_MARKER");
      expect(projectText).toContain("PROJECT_MARKER");
      expect(projectText).not.toContain("TEAM_MARKER");
      expect(projectText).not.toContain("OTHER_PROJECT");
    }
  });
  it("rejects invalid Teamboard filter combinations and selects the production itself", () => {
    expect(() =>
      selectExportRecords({ kind: "productions", records: [production], teamOnly: true }),
    ).toThrow("ausschließlich");
    expect(() =>
      selectExportRecords({ kind: "tasks", records: [], teamOnly: true, productionId: "p1" }),
    ).toThrow("kombiniert");
    expect(
      selectExportRecords({
        kind: "productions",
        records: [production, record("productions", "p2", { title: "Andere Produktion" })],
        productionId: "p1",
      }),
    ).toEqual([production]);
  });
  it("wraps long custom production roles across PDF pages without losing contacts", async () => {
    const contacts = Array.from({ length: 9 }, (_, i) => ({
      id: `contact-${i}`,
      type: "external",
      memberId: "",
      name: `Ännchen von der Bühnenkunst mit einem langen Doppelnamen (Testkontakt ${i})`,
      role:
        "Künstlerische Koordination für Proben, Premiere, Wiederaufnahme und besondere Umbauten. ".repeat(
          i === 3 ? 25 : 3,
        ) + `KONTAKTENDE${i}`,
    }));
    const result = await buildExport(
      input("productions", "pdf", [
        {
          ...production,
          data: {
            ...production.data,
            contacts: [...(production.data.contacts as object[]), ...contacts],
          },
        },
      ]),
    );
    const pdf = await inspectPdf(result.bytes, "production-contacts");
    expect(pdf.pages).toBeGreaterThan(1);
    expect(pdf.text).toMatch(/Klara\s+Weiß/);
    for (let i = 0; i < 9; i++) expect(pdf.text).toContain(`KONTAKTENDE${i}`);
  }, 60000);
  it("embeds private casting and character galleries with resolved production names", async () => {
    const canvas = createCanvas(640, 400),
      context = canvas.getContext("2d");
    context.fillStyle = "#eaf1ed";
    context.fillRect(0, 0, 640, 400);
    context.fillStyle = "#1e5f50";
    context.font = "bold 30px sans-serif";
    context.fillText("FIKTIVE BESETZUNGSGALERIE", 38, 120);
    const image = await sharp(canvas.toBuffer("image/png")).webp().toBuffer();
    const references = {
      productions: [production],
      characters: [
        record("characters", "c1", {
          name: "Käthchen mit einem langen Figurennamen für die Abendvorstellung und den schnellen Szenenwechsel",
          productionId: "p1",
        }),
      ],
      actors: [
        record("actors", "a1", {
          name: "Änne Müller mit einem langen Doppelnamen für die Prüfung der Galerie-Zeilenumbrüche (Testperson)",
        }),
      ],
      files: [
        record("files", "image", { name: "Frisur · Vorderansicht" }),
        record("files", "image2", { name: "Frisur · Rückansicht" }),
      ],
    };
    for (const kind of ["casting", "characters"] as const) {
      const item = record(kind, kind, {
        name: "Käthchen mit einem langen Figurennamen für die Abendvorstellung und den schnellen Szenenwechsel",
        productionId: "p1",
        characterId: "c1",
        actorId: "a1",
        alternate: false,
        imageIds: ["image", "image2"],
        description: "Galeriehinweis: GALERIEENDE",
      });
      const result = await buildExport({
        ...input(kind, "pdf", [item]),
        productionId: "p1",
        references,
        images: { image, image2: image },
      });
      const pdf = await inspectPdf(result.bytes, `${kind}-gallery`);
      expect(pdf.images).toBeGreaterThanOrEqual(2);
      expect(pdf.text).toContain("Frisur · Vorderansicht");
      expect(pdf.text).toContain("Frisur · Rückansicht");
      expect(pdf.text).toContain("Der Zauberwald");
      expect(pdf.text).toContain("GALERIEENDE");
    }
  }, 60000);
  it("prints only Teamboard tasks in its named PDF report", async () => {
    const result = await buildExport({
      ...input("tasks", "pdf", [
        record("tasks", "team", { title: "TEAM_PDF_MARKER" }),
        record("tasks", "project", { title: "PROJECT_PDF_MARKER", productionId: "p1" }),
      ]),
      teamOnly: true,
    });
    const pdf = await inspectPdf(result.bytes, "teamboard-only");
    expect(pdf.text).toContain("Teamboard · Aufgaben");
    expect(pdf.text).toContain("TEAM_PDF_MARKER");
    expect(pdf.text).not.toContain("PROJECT_PDF_MARKER");
  }, 30000);
});
