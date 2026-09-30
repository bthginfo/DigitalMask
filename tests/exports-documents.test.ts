import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildExport } from "../src/modules/exports";
import {
  documentPresentation,
  documentSectionKeys,
} from "../src/modules/exports/document-presentation";
import type { DomainRecord } from "../src/shared/contracts";
import type { ExportInput } from "../src/modules/exports/types";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
): DomainRecord => ({
  kind,
  id,
  data,
  organizationId: "fixture",
  departmentId: "mask",
  version: 1,
  createdBy: "m",
  createdAt: "2026-09-30T08:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
});
const actor = record("actors", "a", {
  name: "Ännchen Weiß von der fiktiven Bühne mit einem langen Doppelnamen",
});
const character = record("characters", "c", { name: "Käthchen aus dem fiktiven Zauberwald" });
const production = record("productions", "p", {
  title: "Fiktiver Zauberwald",
  durationMinutes: 135,
});
const person = record("people", "person", {
  name: "Fiktive Dr. Änne Müller-Weiß",
  organization: "Fiktives Theater",
  position: "Externe künstlerische Leitung",
  email: "aenne.muelller-weiss-mit-einem-sehr-langen-namen@fiktive-buehnenkoordination.example",
  phone: "+49 (0) 0000 / 123456-789 (Fiktive Nummer)",
  notes: "Verzeichnisnotiz DIRECTORYEND",
});
const categories = [
  record("categories", "cat-makeup", {
    scope: "looks",
    key: "makeup",
    name: "Makeup · individuelle Arbeitsfolge",
    order: 1,
  }),
  record("categories", "cat-custom", {
    scope: "looks",
    key: "custom",
    name: "Sonderhinweise für die Bühne",
    order: 6,
  }),
  record("categories", "cat-care", {
    scope: "handovers",
    key: "care",
    name: "Besonders sorgfältig prüfen",
    order: 0,
  }),
  record("categories", "cat-time", {
    scope: "time",
    key: "office",
    name: "Organisation & Büro",
    order: 1,
  }),
  record("categories", "cat-material", {
    scope: "materials",
    key: "wig",
    name: "Perückenbestand · umbenannt",
    order: 0,
  }),
];
const base = (
  kind: string,
  format: ExportInput["format"],
  records: DomainRecord[],
): ExportInput => ({
  kind,
  format,
  records,
  members: [
    {
      id: "m",
      name: "Fiktive Maskenleitung",
      username: "fixture",
      role: "admin",
      status: "active",
    },
  ],
  organization: "Fiktives Theater · Dokumentprüfung",
  department: "Maske",
  references: {
    actors: [actor],
    characters: [character],
    productions: [production],
    people: [person],
    categories,
  },
});
const look = record("looks", "look", {
  title: "ALTER TITEL DARF NICHT ÜBERSCHRIFT SEIN",
  actorId: "a",
  actorName: "Veralteter Schauspielername",
  characterId: "c",
  characterName: "Veraltete Figur",
  productionId: "p",
  productionDurationMinutes: 150,
  status: "published",
  sections: [
    {
      key: "preparation",
      entries: [
        { id: "prep1", label: "Arbeitsplatz", text: "Arbeitsfläche vorbereiten. PREPEND" },
        { id: "prep2", label: "Schutz", text: "Haaransatz schützen. PROTECTEND" },
      ],
    },
    {
      key: "makeup",
      entries: [
        {
          id: "long",
          label: "Schrittweise Anwendung",
          text:
            "Fiktive Arbeitsfolge mit hautschonender Vorbereitung, Farben und präzisen Wiederholungen. ".repeat(
              75,
            ) + "MAKEUPEND",
        },
      ],
    },
    {
      key: "hair",
      entries: [{ id: "hair", text: "Frisur zuerst links, dann rechts prüfen. HAIREND" }],
    },
    {
      key: "wigs-beards",
      entries: [{ id: "wig", text: "Perücke und Bart mit fiktiven Befestigungen sichern. WIGEND" }],
    },
    {
      key: "changeover",
      entries: [{ id: "change", text: "Schneller Wechsel am rechten Bühnenzugang. CHANGEEND" }],
    },
    {
      key: "setup",
      entries: [{ id: "setup", text: "Alle Materialien vor Beginn einrichten. SETUPEND" }],
    },
    {
      key: "custom",
      entries: [
        {
          id: "custom",
          label: "Abendvorstellung",
          text: "Sonderhinweis mit Umlauten und langer Ergänzung. CUSTOMEND",
        },
      ],
    },
  ],
  imageIds: ["image1", "image2"],
});
const handover = record("handovers", "handover", {
  title: "Allgemeine Übergabe mit fiktiven Arbeitsnotizen",
  productionId: "MUST_NOT_PRINT_PRODUCTION",
  status: "MUST_NOT_PRINT_STATUS",
  date: "2039-12-31",
  sections: [
    {
      key: "care",
      entries: [
        {
          id: "care",
          label: "Vor Öffnung",
          text: "Perückenbefestigungen besonders sorgfältig prüfen. ".repeat(30) + "CAREEND",
        },
      ],
    },
    { key: "notes", entries: [{ id: "notes", text: "Fiktive allgemeine Hinweise. NOTESEND" }] },
  ],
  checklist: [
    { text: "Arbeitsplatz prüfen CHECKONE", done: true },
    {
      text: "Lange einzelne Checklistenaufgabe für die Schlusskontrolle. ".repeat(30) + "CHECKTWO",
      done: false,
    },
  ],
  imageIds: ["image1", "image2"],
});

function pictures() {
  return Object.fromEntries(
    ["image1", "image2"].map((id, i) => {
      const canvas = createCanvas(660, 380),
        context = canvas.getContext("2d");
      context.fillStyle = i ? "#e8edf5" : "#eaf1ed";
      context.fillRect(0, 0, 660, 380);
      context.fillStyle = "#1e5f50";
      context.font = "bold 28px sans-serif";
      context.fillText(`FIKTIVE DOKUMENTATION ${i + 1}`, 35, 90);
      context.fillRect(90, 150, 470, 120);
      return [id, new Uint8Array(canvas.toBuffer("image/png"))];
    }),
  );
}
let qaDirectory: string | undefined;
async function pdfCheck(bytes: Uint8Array, name: string) {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const texts: string[] = [];
  let images = 0;
  const imageOps = new Set(
    Object.entries(OPS)
      .filter(([key]) => key.startsWith("paintImage") || key.includes("ImageMask"))
      .map(([, value]) => value),
  );
  const raster = process.env.EXPORT_RENDER_QA === "1";
  if (raster) {
    qaDirectory ??= await mkdtemp(path.join(tmpdir(), "digitalmask-document-exports-"));
    await writeFile(path.join(qaDirectory, `${name}.pdf`), bytes);
  }
  for (let p = 1; p <= document.numPages; p++) {
    const page = await document.getPage(p),
      viewport = page.getViewport({ scale: 1.2 }),
      content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    texts.push(text);
    expect(text).toContain(`Seite ${p} von ${document.numPages}`);
    expect(text.replace(/\s/g, "")).toContain("DIGITALMASK/MASKE");
    for (const item of content.items)
      if ("str" in item && item.str.trim()) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(0);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width / 1.2 + 1);
        expect(item.transform[5]).toBeGreaterThanOrEqual(0);
        expect(item.transform[5]).toBeLessThanOrEqual(viewport.height / 1.2);
        if (item.transform[5] > 40) expect(item.transform[5]).toBeGreaterThanOrEqual(47);
      }
    images += (await page.getOperatorList()).fnArray.filter((op) => imageOps.has(op)).length;
    if (raster) {
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvas: canvas as never,
        canvasContext: canvas.getContext("2d") as never,
        viewport,
      }).promise;
      await writeFile(path.join(qaDirectory!, `${name}-${p}.png`), canvas.toBuffer("image/png"));
    }
  }
  const pages = document.numPages;
  await document.cleanup();
  return { text: texts.join(" "), pages, images, directory: qaDirectory };
}

describe("document and contact presentation exports", () => {
  it("keeps maximum-length record names and season metadata clear of the body", async () => {
    const title = `${"Fiktiver sehr langer Produktionsname mit Bühnenfassung ".repeat(5).slice(0, 190)} TITLEEND`;
    const actorName = `${"Fiktive Schauspielerin mit einem ausführlichen Namen ".repeat(5).slice(0, 190)} ACTOREND`;
    const season = `${"Fiktive umfangreiche Spielzeitbeschreibung ".repeat(5).slice(0, 190)} PERIODEND`;
    for (const kind of ["productions", "looks"] as const) {
      const input = {
        ...base(kind, "pdf", [
          kind === "productions"
            ? record("productions", "boundary", { title, season })
            : record("looks", "boundary", {
                actorName,
                productionName: title,
                productionDurationMinutes: 140,
                sections: [{ key: "makeup", entries: [{ id: "m", text: "BODYEND" }] }],
              }),
        ]),
        season,
      };
      const bytes = (await buildExport(input)).bytes;
      const checked = await pdfCheck(bytes, `${kind}-maximum-header`);
      expect(checked.text.replace(/\s/g, "")).toContain(
        (kind === "productions" ? title : actorName).replace(/\s/g, ""),
      );
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await getDocument({
        data: new Uint8Array(bytes),
        standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
      }).promise;
      const content = await (await doc.getPage(1)).getTextContent();
      const items = content.items.filter((item) => "str" in item && item.str.trim());
      const header = items.filter((item) => "str" in item && item.height < 10);
      const lastHeader = header.find((item) => "str" in item && item.str.includes("PERIODEND"));
      const firstBody = items.find(
        (item) =>
          "str" in item &&
          item.height >= 10 &&
          item.height <= 12 &&
          item.str.startsWith(
            kind === "productions" ? "Fiktiver sehr langer" : "Fiktive Schauspielerin",
          ),
      );
      expect(
        lastHeader && "transform" in lastHeader && firstBody && "transform" in firstBody
          ? lastHeader.transform[5] - firstBody.transform[5]
          : 0,
      ).toBeGreaterThan(45);
      await doc.cleanup();
    }
  }, 60000);
  it("preserves Unicode text after compound-glyph subsetting and across parallel PDFs", async () => {
    // Umlaut subset components can enter Fontkit's shared glyph cache without
    // Unicode metadata. A subsequent document must still map O and punctuation.
    await buildExport(
      base("productions", "pdf", [record("productions", "warm", { title: "Ö Ü Ä" })]),
    );
    const markers = ["ROLEEND0 O. Dr. Änne", "ROLEEND1 O. Dr. Weiß", "ROLEEND2 O. Dr. Müller"];
    const buffers = await Promise.all(
      markers.map((title, i) =>
        buildExport(
          base("productions", "pdf", [record("productions", `parallel-${i}`, { title })]),
        ),
      ),
    );
    for (const [i, result] of buffers.entries()) {
      const parsed = await pdfCheck(result.bytes, `unicode-parallel-${i}`);
      expect(parsed.text).toContain(markers[i]);
      expect(parsed.text).not.toContain("R)LEEND");
    }
  }, 60000);
  it("respects authoritative category collections without reviving unused defaults", () => {
    const legacy = record("looks", "empty-legacy", { title: "Fiktive Legacy Person" });
    const input = base("looks", "csv", [legacy]);
    expect(documentSectionKeys("looks", { ...input, references: { categories: [] } })).toEqual([]);
    expect(documentSectionKeys("looks", { ...input, references: undefined })).toContain("makeup");
    const used = record("looks", "used", {
      title: "Fiktive Person",
      preparation: "Verwendete historische Vorbereitung",
    });
    expect(
      documentSectionKeys("looks", { ...input, records: [used], references: { categories: [] } }),
    ).toEqual(["preparation"]);
    const explicit = record("looks", "explicit", { sections: [{ key: "persisted", entries: [] }] });
    expect(
      documentSectionKeys("looks", {
        ...input,
        records: [explicit],
        references: { categories: [] },
      }),
    ).toEqual(["persisted"]);
  });
  it("uses current directory profiles for external production roles and exports a separate contact directory", async () => {
    const item = {
      ...production,
      data: {
        ...production.data,
        contacts: [
          {
            id: "e",
            role: "Externe künstlerische Koordination",
            type: "external",
            personId: "person",
            name: "Veralteter Kontakt",
            memberId: "",
          },
          { id: "m", role: "Leitung Maske", type: "makeup", memberId: "m", name: "Veraltet" },
        ],
      },
    };
    const csv = new TextDecoder().decode(
      (await buildExport(base("productions", "csv", [item]))).bytes,
    );
    expect(csv).toContain(person.data.name);
    expect(csv).toContain(person.data.email);
    expect(csv).toContain(person.data.phone);
    expect(csv).toContain("Fiktive Maskenleitung");
    expect(csv).not.toContain("Veralteter Kontakt");
    const directory = new TextDecoder().decode(
      (await buildExport(base("people", "csv", [person]))).bytes,
    );
    expect(directory).toContain('"Organisation"');
    expect(directory).toContain('"Position"');
    expect(directory).toContain("DIRECTORYEND");
    const json = JSON.parse(
      new TextDecoder().decode((await buildExport(base("people", "json", [person]))).bytes),
    );
    expect(json.records[0].data).toEqual(person.data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array((await buildExport(base("people", "xlsx", [person]))).bytes).buffer,
    );
    expect(workbook.getWorksheet("Daten")!.getCell("D5").value).toBe(person.data.email);
  });
  it("prefers casting references, accepts free-text alternatives and never prints unresolved IDs", async () => {
    const items = [
      record("casting", "linked", {
        productionId: "p",
        actorId: "a",
        actorName: "Wrong actor snapshot",
        characterId: "c",
        characterName: "Wrong character snapshot",
      }),
      record("casting", "text", {
        productionId: "p",
        actorName: "Fiktiver Gastactor",
        characterName: "Fiktive Gastfigur",
      }),
      record("casting", "missing", {
        actorId: "SECRET_ACTOR_ID",
        characterId: "SECRET_CHARACTER_ID",
      }),
    ];
    const csv = new TextDecoder().decode((await buildExport(base("casting", "csv", items))).bytes);
    expect(csv).toContain(actor.data.name);
    expect(csv).toContain(character.data.name);
    expect(csv).toContain("Fiktiver Gastactor");
    expect(csv).toContain("Fiktive Gastfigur");
    expect(csv).toContain("Nicht angegeben");
    expect(csv).not.toContain("SECRET_");
    expect(csv).not.toContain("Wrong actor");
  });
  it("exports actor-titled structured sheets, repeatable entries, custom labels and production duration", async () => {
    const csv = new TextDecoder().decode((await buildExport(base("looks", "csv", [look]))).bytes);
    expect(csv).toContain(actor.data.name);
    expect(csv).toContain("Arbeitsplatz\nArbeitsfläche");
    expect(csv).toContain("Makeup · individuelle Arbeitsfolge");
    expect(csv).toContain("CUSTOMEND");
    expect(csv).toContain('"150"');
    expect(csv).not.toContain('"Szene"');
    expect(csv).not.toContain('"Status"');
    expect(csv).not.toContain("ALTER TITEL");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      new Uint8Array((await buildExport(base("looks", "xlsx", [look]))).bytes).buffer,
    );
    const sheet = workbook.getWorksheet("Daten")!;
    const headers = sheet.getRow(4).values as string[];
    expect(headers).toContain("Sonderhinweise für die Bühne");
    expect(sheet.pageSetup.printTitlesColumn).toBe("A:B");
    expect(sheet.pageSetup.fitToWidth).toBeGreaterThan(1);
    expect(sheet.getSheetValues().flat().join(" ")).toContain("MAKEUPEND");
    expect(sheet.getSheetValues().flat().join(" ")).toContain("CUSTOMEND");
    const payload = JSON.parse(
      new TextDecoder().decode((await buildExport(base("looks", "json", [look]))).bytes),
    );
    expect(payload.records[0].data.sections).toEqual(look.data.sections);
    expect(documentPresentation(look, base("looks", "csv", [look])).productionDurationMinutes).toBe(
      150,
    );
  });
  it("retains legacy text/template values and identifies old scene/time details as historical notes", async () => {
    const legacy = record("looks", "legacy", {
      title: "Legacy Schauspieler",
      productionId: "p",
      preparation: "LEGPREP",
      materials: "LEGMATERIAL",
      steps: "LEGMAKEUP",
      changeover: "LEGCHANGE",
      notes: "LEGNOTES",
      scene: "LEGSCENE",
      durationMinutes: 11,
      templateVersion: 3,
      templateFields: { "Altvorlage Spezial": "LEGTEMPLATE" },
    });
    const csv = new TextDecoder().decode((await buildExport(base("looks", "csv", [legacy]))).bytes);
    for (const marker of [
      "LEGPREP",
      "LEGMATERIAL",
      "LEGMAKEUP",
      "LEGCHANGE",
      "LEGNOTES",
      "LEGTEMPLATE",
      "LEGSCENE",
    ])
      expect(csv).toContain(marker);
    expect(csv).toContain("Früherer Zeitbedarf: 11 min");
    expect(csv).toContain("Vorlagenhistorie: Version 3");
    expect(csv).toContain('"135"');
    const old = record("handovers", "old", {
      title: "Legacy Übergabe",
      notes: "LEGACY_HANDOVER_NOTES",
      checklist: [{ text: "CHECKLEGACY", done: false }],
    });
    const text = new TextDecoder().decode(
      (await buildExport(base("handovers", "csv", [old]))).bytes,
    );
    expect(text.split("LEGACY_HANDOVER_NOTES")).toHaveLength(2);
    expect(text).toContain("[ ] CHECKLEGACY");
    expect(text).not.toContain('"Produktion"');
    expect(text).not.toContain('"Status"');
    const time = new TextDecoder().decode(
      (
        await buildExport(
          base("time", "csv", [
            record("time", "time", {
              date: "2026-10-01",
              userId: "m",
              title: "Büro",
              category: "office",
              durationSeconds: 3600,
            }),
          ]),
        )
      ).bytes,
    );
    expect(time).toContain("Organisation & Büro");
    const material = new TextDecoder().decode(
      (
        await buildExport(
          base("materials", "csv", [
            record("materials", "material", { name: "Fiktive Perücke", category: "wig" }),
          ]),
        )
      ).bytes,
    );
    expect(material).toContain("Perückenbestand · umbenannt");
  });
  it("renders complete actor documents with multi-page entries, private images and category labels", async () => {
    const result = await pdfCheck(
      (await buildExport({ ...base("looks", "pdf", [look]), images: pictures() })).bytes,
      "structured-look",
    );
    expect(result.pages).toBeGreaterThan(3);
    expect(result.images).toBeGreaterThanOrEqual(2);
    for (const marker of [
      "PREPEND",
      "PROTECTEND",
      "MAKEUPEND",
      "HAIREND",
      "WIGEND",
      "CHANGEEND",
      "SETUPEND",
      "CUSTOMEND",
    ])
      expect(result.text).toContain(marker);
    expect(result.text).toContain("Stückdauer: 150 min");
    expect(result.text).toContain("Makeup · individuelle Arbeitsfolge");
    expect(result.text).not.toContain("ALTER TITEL");
    expect(result.text).not.toContain("Veröffentlicht");
  }, 60000);
  it("renders global handovers as separate checklist items with all images and legacy notes once", async () => {
    const legacy = record("handovers", "legacy", {
      title: "Fiktive Legacy Übergabe",
      notes: "LEGACY_HANDOVER_NOTES",
      imageIds: ["image1"],
    });
    const result = await pdfCheck(
      (await buildExport({ ...base("handovers", "pdf", [handover, legacy]), images: pictures() }))
        .bytes,
      "global-handovers",
    );
    expect(result.images).toBeGreaterThanOrEqual(3);
    for (const marker of ["CAREEND", "NOTESEND", "CHECKONE", "CHECKTWO"])
      expect(result.text).toContain(marker);
    expect(result.text.split("LEGACY_HANDOVER_NOTES")).toHaveLength(2);
    expect(result.text).toContain("Besonders sorgfältig prüfen");
    expect(result.text).not.toContain("MUST_NOT_PRINT");
    expect(result.text).not.toContain("2039");
  }, 60000);
  it("wraps directory contact emails and custom production roles into readable multi-page PDFs", async () => {
    const item = {
      ...production,
      data: {
        ...production.data,
        contacts: Array.from({ length: 6 }, (_, i) => ({
          id: `c${i}`,
          role:
            "Fiktive künstlerische Koordination für Probe, Premiere und besonderen Einrichtungsbedarf. ".repeat(
              3,
            ) + `ROLEEND${i}`,
          type: "external",
          personId: "person",
          name: "Old name",
          memberId: "",
        })),
      },
    };
    const result = await pdfCheck(
      (await buildExport(base("productions", "pdf", [item]))).bytes,
      "directory-production",
    );
    expect(result.pages).toBeGreaterThan(1);
    expect(result.text).toContain("DIRECTORYEND");
    for (let i = 0; i < 6; i++) expect(result.text).toContain(`ROLEEND${i}`);
    expect(result.text).not.toContain("Old name");
  }, 60000);
});
