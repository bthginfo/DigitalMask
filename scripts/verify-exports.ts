/** Fictional-only print fixtures. Run: npx tsx scripts/verify-exports.ts */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { buildExport } from "../src/modules/exports";
import type { ExportInput } from "../src/modules/exports/types";
import type { DomainRecord, Member } from "../src/shared/contracts";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const member: Member = {
  id: "fixture-user",
  name: "Klara Weiß (Testperson)",
  username: "fixture",
  role: "user",
  status: "active",
};
const record = (
  kind: DomainRecord["kind"],
  id: string,
  data: DomainRecord["data"],
): DomainRecord => ({
  kind,
  id,
  data,
  createdAt: "2026-09-30T08:00:00Z",
  updatedAt: "2026-09-30T08:00:00Z",
  organizationId: "fixture",
  departmentId: "fixture",
  createdBy: member.id,
  version: 1,
});
export async function verifyExports() {
  const directory = path.join(process.cwd(), "artifacts", "exports");
  await mkdir(directory, { recursive: true });
  const photo = createCanvas(800, 480),
    ctx = photo.getContext("2d");
  ctx.fillStyle = "#eaf1ed";
  ctx.fillRect(0, 0, 800, 480);
  ctx.fillStyle = "#1e5f50";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("AUFSCHRIEB · TESTBILD", 70, 180);
  ctx.font = "25px sans-serif";
  ctx.fillText("Fiktive Dokumentation / keine Personendaten", 70, 245);
  const events = Array.from({ length: 52 }, (_, i) =>
    record("events", `fixture-event-${i}`, {
      title: `Vorbereitung ${i + 1}: Perückenprobe mit Überprüfung der Haaransätze`,
      start: `2026-09-${String(i < 18 ? 30 : 1 + (i % 29)).padStart(2, "0")}T${String(8 + (i % 8)).padStart(2, "0")}:00:00Z`,
      end: `2026-09-${String(i < 18 ? 30 : 1 + (i % 29)).padStart(2, "0")}T${String(9 + (i % 8)).padStart(2, "0")}:00:00Z`,
      participantIds: [member.id],
      category: "preparation",
      location: "Maskenraum · Hauptbühne",
      description:
        "Bitte Werkzeug prüfen; Änderung des Haaransatzes nach Rücksprache mit der Regie. Vollständiger Hinweis am Ende: GEPRÜFT.",
    }),
  );
  const time = Array.from({ length: 62 }, (_, i) =>
    record("time", `fixture-time-${i}`, {
      title: `Haarteile nähen und Ansatz prüfen ${i}`,
      date: `2026-09-${String(1 + (i % 30)).padStart(2, "0")}`,
      durationSeconds: 6300,
      userId: member.id,
      productionId: i % 3 ? "fixture-production" : "",
    }),
  );
  const looks = [
    record("looks", "fixture-look", {
      title: "Käthchen · Szene 4 / Abendlook",
      productionId: "fixture-production",
      characterId: "fixture-character",
      actorId: "fixture-actor",
      scene: "4 · Der Übergang",
      preparation: "Haaransatz schützen. Arbeitsfläche vorbereiten. Alle Werkzeuge prüfen.",
      materials:
        "Zwei Haarteile; Haarnadeln; Bürste; Puder; Kleber nach freigegebener Materialliste.",
      steps:
        "Ansatz vorsichtig glätten und Sitz prüfen.\n" +
        "Jeden Arbeitsschritt dokumentieren und die Symmetrie der Frisur unter Bühnenlicht prüfen. ".repeat(
          80,
        ) +
        "\nLETZTER ARBEITSSCHRITT: LOOKMARKER",
      changeover: "Wechsel in 8 Minuten. Ersatzhaarteil bereitstellen.",
      durationMinutes: 25,
      status: "published",
      templateVersion: 2,
      imageIds: ["fixture-image"],
    }),
  ];
  const base = {
    organization: "Fiktives Testtheater · Druckprüfung",
    department: "Maske",
    members: [member],
    references: {
      productions: [
        record("productions", "fixture-production", { title: "Der Zauberwald · Testproduktion" }),
      ],
      characters: [record("characters", "fixture-character", { name: "Käthchen" })],
      actors: [record("actors", "fixture-actor", { name: "Änne Müller (Testperson)" })],
    },
    images: { "fixture-image": new Uint8Array(photo.toBuffer("image/png")) },
  };
  const fixtures: { name: string; input: ExportInput }[] = [
    ...["month", "week", "team", "day", "agenda"].map((view) => ({
      name: `calendar-${view}`,
      input: {
        ...base,
        kind: "events",
        format: "pdf" as const,
        records: events,
        from: view === "month" ? "2026-09-01" : "2026-09-28",
        to: "2026-09-30",
        view,
      },
    })),
    {
      name: "time",
      input: {
        ...base,
        kind: "time",
        format: "pdf",
        records: time,
        from: "2026-09-01",
        to: "2026-09-30",
      },
    },
    { name: "looks", input: { ...base, kind: "looks", format: "pdf", records: looks } },
  ];
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const report: { name: string; pages: number; chars: number; overflow: number }[] = [];
  for (const fixture of fixtures) {
    const result = await buildExport(fixture.input);
    await writeFile(path.join(directory, `${fixture.name}.pdf`), result.bytes);
    const pdf = await getDocument({
      data: result.bytes,
      standardFontDataUrl: `${process.cwd().replace(/\\/g, "/")}/node_modules/pdfjs-dist/standard_fonts/`,
    }).promise;
    let chars = 0,
      overflow = 0,
      allText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p),
        viewport = page.getViewport({ scale: 1.4 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext("2d") as never,
        viewport,
        canvas: canvas as never,
      }).promise;
      await writeFile(
        path.join(directory, `${fixture.name}-${p}.png`),
        canvas.toBuffer("image/png"),
      );
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      if (!new RegExp(`Seite ${p} von ${pdf.numPages}`).test(pageText))
        throw new Error(`${fixture.name}: page counter missing on page ${p}`);
      for (const item of content.items)
        if ("str" in item) {
          chars += item.str.length;
          allText += item.str + " ";
          if (
            item.transform[4] < -1 ||
            item.transform[5] < -1 ||
            item.transform[4] + item.width > viewport.width / 1.4 + 1 ||
            item.transform[5] > viewport.height / 1.4 + 1
          )
            overflow++;
        }
    }
    if (fixture.name === "looks" && !allText.includes("LOOKMARKER"))
      throw new Error("Look sheet text was lost.");
    if (overflow) throw new Error(`${fixture.name}: ${overflow} text fragments outside media box`);
    report.push({ name: fixture.name, pages: pdf.numPages, chars, overflow });
    await pdf.cleanup();
  }
  await writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/verify-exports.ts"))
  verifyExports().catch((error) => {
    process.stderr.write(String(error));
    process.exitCode = 1;
  });
