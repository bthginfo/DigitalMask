import { load } from "cheerio";
import { strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import type { DocumentMetadata } from "./contracts";
import { SHEETS_MAP } from "./contracts";
import { createSheetCalculator, excelFormula, inputValue } from "./sheet-values";
import { sheetDimensions } from "./presentation";
import { originalCellInput } from "./sheet-import";
import ExcelJS from "exceljs";
import { HttpError } from "@/platform/http";

const xml = (bytes: Uint8Array) => load(new TextDecoder().decode(bytes), { xmlMode: true });
const relationTypes = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

/** Keep images, charts, styles, print settings and other parts; update cell XML in place. */
export async function patchOriginalSpreadsheet(
  original: Buffer,
  document: Y.Doc,
  metadata: DocumentMetadata,
) {
  const archive = unzipSync(original);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(original as unknown as ExcelJS.Buffer);
  const $workbook = xml(archive["xl/workbook.xml"]);
  const $relations = xml(archive["xl/_rels/workbook.xml.rels"]);
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const info = metadata.sheets || [];
  const evaluate = createSheetCalculator(sheets, info);
  for (const sheet of info) {
    const source = workbook.worksheets.find((worksheet) => String(worksheet.id) === sheet.id);
    const relationId = $workbook("sheet")
      .toArray()
      .find((node) => node.attribs.name === sheet.name)?.attribs["r:id"];
    const target = $relations("Relationship")
      .toArray()
      .find((node) => node.attribs.Id === relationId)?.attribs.Target;
    const path = target?.startsWith("/") ? target.slice(1) : `xl/${target}`;
    if (!source || !target || !archive[path])
      throw new HttpError(400, "Die Tabellenstruktur konnte nicht exportiert werden.");
    const $sheet = xml(archive[path]);
    const data = $sheet("sheetData");
    const dimension = sheetDimensions(document, sheet);
    sheets.get(sheet.id)?.forEach((raw, key) => {
      const [row, col] = key.split(":").map(Number);
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 1 ||
        col < 1 ||
        row > dimension.rows ||
        col > dimension.columns
      )
        return;
      const sourceCell = source.getCell(row, col);
      if (sourceCell.isMerged && sourceCell.master.address !== sourceCell.address) return;
      const originalRaw = originalCellInput(sourceCell);
      if (originalRaw === raw && !raw.startsWith("=")) return;
      let rowElement = data.children("row").filter((_i, node) => node.attribs.r === String(row));
      if (!rowElement.length) {
        data.append(`<row r="${row}"/>`);
        rowElement = data.children("row").last();
      }
      const address = sourceCell.address;
      let cell = rowElement.children("c").filter((_i, node) => node.attribs.r === address);
      if (!cell.length) {
        rowElement.append(`<c r="${address}"/>`);
        cell = rowElement.children("c").last();
      }
      if (raw.startsWith("=")) {
        if (raw !== originalRaw) {
          cell.children("f,is").remove();
          cell.append("<f/>");
          cell.children("f").text(excelFormula(raw));
        }
        const result = evaluate(sheet.id, row, col);
        if (
          typeof result === "number" ||
          typeof result === "boolean" ||
          typeof result === "string"
        ) {
          // Error text is display-only; Excel recalculates unsupported functions on opening.
          if (typeof result === "string" && result.startsWith("#")) return;
          cell.children("v").remove();
          cell.attr(
            "t",
            typeof result === "boolean" ? "b" : typeof result === "number" ? "n" : "str",
          );
          cell.append("<v/>");
          cell
            .children("v")
            .text(typeof result === "boolean" ? (result ? "1" : "0") : String(result));
        }
        return;
      }
      cell.children("f,v,is").remove();
      const value = inputValue(raw);
      if (value == null) {
        cell.removeAttr("t");
        return;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        cell.attr("t", typeof value === "number" ? "n" : "b");
        cell.append("<v/>");
        cell.children("v").text(typeof value === "boolean" ? (value ? "1" : "0") : String(value));
      } else {
        // ISO dates keep the source date cell format and its Excel serial representation.
        if (sourceCell.value instanceof Date && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const serial =
            Date.parse(`${value}T00:00:00Z`) / 86400000 +
            25569 -
            (workbook.properties.date1904 ? 1462 : 0);
          cell.attr("t", "n").append("<v/>");
          cell.children("v").text(String(serial));
        } else {
          cell.attr("t", "inlineStr").append('<is><t xml:space="preserve"/></is>');
          cell.find("t").text(value);
        }
      }
    });
    // OOXML requires ascending row/cell order, including newly inserted cells.
    data
      .children("row")
      .toArray()
      .sort((a, b) => Number(a.attribs.r) - Number(b.attribs.r))
      .forEach((row) => {
        $sheet(row)
          .children("c")
          .toArray()
          .sort(
            (a, b) =>
              Number(source.getCell(a.attribs.r).col) - Number(source.getCell(b.attribs.r).col),
          )
          .forEach((cell) => $sheet(row).append(cell));
        data.append(row);
      });
    if ($sheet("dimension").length)
      $sheet("dimension").attr(
        "ref",
        `A1:${source.getCell(dimension.rows, dimension.columns).address}`,
      );
    archive[path] = strToU8($sheet.xml());
  }
  if (!$workbook("calcPr").length) $workbook("workbook").append("<calcPr/>");
  $workbook("calcPr").attr({ fullCalcOnLoad: "1", forceFullCalc: "1", calcMode: "auto" });
  archive["xl/workbook.xml"] = strToU8($workbook.xml());
  return Buffer.from(zipSync(archive, { level: 6 }));
}

/** Preserve Word page setup, headers/footers and unrelated package parts as a backup-compatible shell. */
export function patchOriginalWord(original: Buffer, generated: Buffer) {
  const archive = unzipSync(original),
    next = unzipSync(generated);
  const $original = xml(archive["word/document.xml"]),
    $next = xml(next["word/document.xml"]);
  const $relations = xml(
    archive["word/_rels/document.xml.rels"] ||
      strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
      ),
  );
  const $newRelations = xml(next["word/_rels/document.xml.rels"]);
  const $types = xml(archive["[Content_Types].xml"]);
  const $newTypes = xml(next["[Content_Types].xml"]);
  const originalSection = $original("w\\:body").children("w\\:sectPr").last().clone();
  const newBody = $next("w\\:body");
  newBody.children("w\\:sectPr").remove();
  const nextNamespace = $next("w\\:document").attr() || {};
  const originalRoot = $original("w\\:document");
  for (const [name, value] of Object.entries(nextNamespace))
    if (name.startsWith("xmlns:") && !originalRoot.attr(name)) originalRoot.attr(name, value);

  // Namespacing styles/relationships avoids colliding with header/footer references.
  const $newStyles = xml(next["word/styles.xml"]);
  const styleIds = new Map<string, string>();
  $newStyles("w\\:style").each((_i, node) => {
    const id = $newStyles(node).attr("w:styleId")!;
    styleIds.set(id, `DM_${id}`);
  });
  $newStyles("w\\:style").each((_i, node) => {
    $newStyles(node)
      .attr("w:styleId", styleIds.get($newStyles(node).attr("w:styleId")!)!)
      .removeAttr("w:default");
  });
  $newStyles("w\\:basedOn,w\\:next,w\\:link").each((_i, node) => {
    const id = $newStyles(node).attr("w:val")!;
    if (styleIds.has(id)) $newStyles(node).attr("w:val", styleIds.get(id)!);
  });
  newBody.find("w\\:pStyle,w\\:rStyle,w\\:tblStyle").each((_i, node) => {
    const id = $next(node).attr("w:val")!;
    if (styleIds.has(id)) $next(node).attr("w:val", styleIds.get(id)!);
  });
  const $styles = xml(
    archive["word/styles.xml"] ||
      strToU8('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'),
  );
  // A single export starts from the uploaded original, so styles never accumulate across downloads.
  $styles("w\\:styles").append($newStyles("w\\:styles").children("w\\:style").clone());
  archive["word/styles.xml"] = strToU8($styles.xml());
  if (
    !$relations("Relationship")
      .toArray()
      .some((node) => node.attribs.Type.endsWith("/styles"))
  )
    $relations("Relationships").append(
      `<Relationship Id="DM_styles" Type="${relationTypes}styles" Target="styles.xml"/>`,
    );
  $newRelations("Relationship").each((_i, node) => {
    const element = $newRelations(node);
    if (!/\/(?:image|hyperlink)$/.test(element.attr("Type") || "")) return;
    const oldId = element.attr("Id")!,
      id = `DM_${oldId}`;
    newBody.find("*").each((_j, child) => {
      for (const attr of ["r:id", "r:embed", "r:link"])
        if ($next(child).attr(attr) === oldId) $next(child).attr(attr, id);
    });
    const target = element.attr("Target") || "";
    if (element.attr("Type")?.endsWith("/image")) {
      const newTarget = `media/DM_${target.split("/").at(-1)}`;
      if (next[`word/${target}`]) archive[`word/${newTarget}`] = next[`word/${target}`];
      element.attr("Target", newTarget);
    }
    element.attr("Id", id);
    $relations("Relationships").append(element.clone());
  });
  for (const node of $newTypes("Default,Override").toArray()) {
    const attr = node.name === "Default" ? "Extension" : "PartName";
    if (node.name === "Override" && node.attribs.PartName !== "/word/styles.xml") continue;
    if (
      !$types(node.name)
        .toArray()
        .some((existing) => $types(existing).attr(attr) === node.attribs[attr])
    )
      $types("Types").append($newTypes(node).clone());
  }
  $original("w\\:body").empty().append(newBody.children().clone()).append(originalSection);
  archive["word/document.xml"] = strToU8($original.xml());
  archive["word/_rels/document.xml.rels"] = strToU8($relations.xml());
  archive["[Content_Types].xml"] = strToU8($types.xml());
  return Buffer.from(zipSync(archive, { level: 6 }));
}
