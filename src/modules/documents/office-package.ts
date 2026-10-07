import { load } from "cheerio";
import { strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import type { DocumentMetadata } from "./contracts";
import { SHEETS_MAP, cellKey, MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "./contracts";
import { createSheetCalculator, excelFormula, inputValue } from "./sheet-values";
import { sheetDimensions } from "./presentation";
import { originalCellInput, originalFormulaArrays } from "./sheet-import";
import ExcelJS from "exceljs";
import { HttpError } from "@/platform/http";
import { safeSheetMetadata } from "./format-upgrade";

const xml = (bytes: Uint8Array) => load(new TextDecoder().decode(bytes), { xmlMode: true });
const relationTypes = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

/** Keep images, charts, styles, print settings and other parts; update cell XML in place. */
export async function patchOriginalSpreadsheet(
  original: Buffer,
  document: Y.Doc,
  metadata: DocumentMetadata,
) {
  metadata = safeSheetMetadata(document, metadata);
  const archive = unzipSync(original);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(original as unknown as ExcelJS.Buffer);
  const $workbook = xml(archive["xl/workbook.xml"]);
  const $relations = xml(archive["xl/_rels/workbook.xml.rels"]);
  const sheets = document.getMap<Y.Map<string>>(SHEETS_MAP);
  const info = (metadata.sheets || []).map((sheet) => {
    const source = workbook.worksheets.find((worksheet) => String(worksheet.id) === sheet.id);
    return source ? { ...sheet, formulaArrays: originalFormulaArrays(source) } : sheet;
  });
  const evaluate = createSheetCalculator(sheets, info);
  // Unsupported functions cannot safely reuse cached values after any workbook input changes.
  const inputsUnchanged =
    info.length === workbook.worksheets.length &&
    info.every((sheet) => {
      const source = workbook.worksheets.find((worksheet) => String(worksheet.id) === sheet.id),
        values = sheets.get(sheet.id);
      if (!source || !values) return false;
      let unchanged = true;
      source.eachRow((row, r) =>
        row.eachCell((cell, c) => {
          if (cell.isMerged && cell.master.address !== cell.address) return;
          if (originalCellInput(cell) !== (values.get(cellKey(r, c)) || "")) unchanged = false;
        }),
      );
      values.forEach((raw, key) => {
        const [row, column] = key.split(":").map(Number);
        if (
          !Number.isInteger(row) ||
          !Number.isInteger(column) ||
          row < 1 ||
          column < 1 ||
          row > MAX_SHEET_ROWS ||
          column > MAX_SHEET_COLUMNS
        )
          return;
        if (originalCellInput(source.getCell(row, column)) !== raw) unchanged = false;
      });
      return unchanged;
    });
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
    const values = sheets.get(sheet.id);
    const sharedGroups = new Map<string, string[]>();
    const cellElements = new Map<string, ReturnType<typeof $sheet>>();
    $sheet("c").each((_i, node) => {
      const cell = $sheet(node),
        formula = cell.children("f");
      cellElements.set(node.attribs.r, cell);
      if (formula.attr("t") !== "shared") return;
      const id = formula.attr("si") || "";
      const group = sharedGroups.get(id);
      if (group) group.push(node.attribs.r);
      else sharedGroups.set(id, [node.attribs.r]);
    });
    for (const group of sharedGroups.values()) {
      if (
        !group.some((address) => {
          const cell = source.getCell(address);
          return (
            (values?.get(cellKey(Number(cell.row), Number(cell.col))) || "") !==
            originalCellInput(cell)
          );
        })
      )
        continue;
      // Editing any member invalidates the shared master. Materialize the complete group first.
      for (const address of group) {
        const sourceCell = source.getCell(address),
          raw = values?.get(cellKey(Number(sourceCell.row), Number(sourceCell.col))) || "",
          cell = cellElements.get(address)!;
        cell.children("f").remove();
        if (raw.startsWith("=")) cell.append("<f/>").children("f").text(excelFormula(raw));
      }
    }
    if (sheet.merges) {
      for (const merge of source.model.merges || []) {
        if (!sheet.merges.includes(merge)) {
          source.unMergeCells(merge);
          $sheet("mergeCell")
            .filter((_i, node) => node.attribs.ref === merge)
            .remove();
        }
      }
      const mergeCells = $sheet("mergeCells");
      if (mergeCells.children().length)
        mergeCells.attr("count", String(mergeCells.children().length));
      else mergeCells.remove();
    }
    const dimension = sheetDimensions(document, sheet);
    const keys = new Set(values?.keys());
    source.eachRow((row, r) =>
      row.eachCell((cell, c) => {
        if (cell.isMerged && cell.master.address !== cell.address) return;
        if (originalCellInput(cell)) keys.add(cellKey(r, c));
      }),
    );
    keys.forEach((key) => {
      const raw = values?.get(key) || "";
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
          cell.children("f,v,is").remove();
          cell.removeAttr("t");
          cell.append("<f/>");
          cell.children("f").text(excelFormula(raw));
        }
        const result = evaluate(sheet.id, row, col);
        if (
          typeof result === "number" ||
          typeof result === "boolean" ||
          typeof result === "string"
        ) {
          // Browser-only errors must never become cached Excel strings or stale results.
          if (evaluate.hasError(sheet.id, row, col)) {
            if (!inputsUnchanged || raw !== originalRaw) {
              cell.children("v,is").remove();
              cell.removeAttr("t");
            }
            return;
          }
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
    if (!inputsUnchanged) {
      // Unsupported array/spill outputs share their anchor's cache and must be recalculated too.
      const stride = dimension.columns + 2,
        covered = new Int32Array((dimension.rows + 2) * stride);
      $sheet("c").each((_i, node) => {
        const formula = $sheet(node).children("f"),
          ref = formula.attr("ref"),
          anchor = source.getCell(node.attribs.r);
        if (
          formula.attr("t") !== "array" ||
          !ref ||
          !evaluate.hasError(sheet.id, Number(anchor.row), Number(anchor.col))
        )
          return;
        const [first, last = first] = ref.replaceAll("$", "").split(":"),
          from = source.getCell(first),
          to = source.getCell(last);
        const top = Math.max(1, Number(from.row)),
          left = Math.max(1, Number(from.col)),
          bottom = Math.min(dimension.rows, Number(to.row)),
          right = Math.min(dimension.columns, Number(to.col));
        if (top > bottom || left > right) return;
        covered[top * stride + left]++;
        covered[top * stride + right + 1]--;
        covered[(bottom + 1) * stride + left]--;
        covered[(bottom + 1) * stride + right + 1]++;
      });
      for (let row = 1; row <= dimension.rows; row++)
        for (let column = 1; column <= dimension.columns; column++) {
          const index = row * stride + column;
          covered[index] +=
            covered[index - 1] + covered[index - stride] - covered[index - stride - 1];
        }
      for (const [address, element] of cellElements) {
        const cell = source.getCell(address),
          row = Number(cell.row),
          column = Number(cell.col);
        if (
          row <= dimension.rows &&
          column <= dimension.columns &&
          covered[row * stride + column] > 0 &&
          originalCellInput(cell) === (values?.get(cellKey(row, column)) || "")
        )
          element.children("v").remove();
      }
    }
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
  if (!inputsUnchanged) {
    // A prior dependency chain can point to overwritten formula cells.
    $relations("Relationship").each((_i, node) => {
      if (!node.attribs.Type.endsWith("/calcChain")) return;
      const target = node.attribs.Target,
        path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      delete archive[path];
      $relations(node).remove();
      const $types = xml(archive["[Content_Types].xml"]);
      $types("Override")
        .filter((_index, entry) => entry.attribs.PartName === `/${path}`)
        .remove();
      archive["[Content_Types].xml"] = strToU8($types.xml());
    });
    archive["xl/_rels/workbook.xml.rels"] = strToU8($relations.xml());
  }
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
