import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import ExcelJS from "exceljs";
import { load } from "cheerio";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { importSpreadsheet } from "@/modules/documents/sheet-import";
import { patchOriginalSpreadsheet } from "@/modules/documents/office-package";
import { exportSpreadsheet } from "@/modules/documents/sheet-export";
import { createSheetCalculator, excelFormula } from "@/modules/documents/sheet-values";
import { translateSharedFormula } from "@/modules/documents/formula-tokens";
import { SHEETS_MAP, type DocumentMetadata } from "@/modules/documents/contracts";
import { encodeDocument, mergedDocument } from "@/modules/documents/state";

async function sharedWorkbook() {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Stunden");
  sheet.getCell("A1").value = 2;
  sheet.getCell("A2").value = 3;
  sheet.getCell("A3").value = 4;
  sheet.fillFormula("B1:B3", "A1*2", [4, 6, 8]);
  sheet.getCell("C1").value = { formula: "'Material'!A1+B1", result: 9 };
  sheet.getCell("D1").value = { formula: '"SUMME(A1); WENN("', result: "SUMME(A1); WENN(" };
  sheet.getCell("E1").value = { formula: "_xlfn.UNKNOWN(A1)", result: 200 };
  const array: ExcelJS.CellFormulaValue & { shareType: "array"; ref: string } = {
    formula: "_xlfn.SEQUENCE(2)",
    result: 1,
    shareType: "array",
    ref: "F1:F2",
  };
  sheet.getCell("F1").value = array;
  sheet.getCell("F2").value = 2;
  sheet.getCell("G1").value = { formula: "SUM(F2)", result: 2 };
  sheet.getCell("H1").value = { formula: "IFERROR(F2,99)", result: 2 };
  workbook.addWorksheet("Material").getCell("A1").value = 5;
  const original = unzipSync(Buffer.from(await workbook.xlsx.writeBuffer()));
  const $sheet = load(strFromU8(original["xl/worksheets/sheet1.xml"]), { xmlMode: true });
  $sheet('c[r="F1"]').attr("cm", "1");
  $sheet('c[r="F1"] f').attr("aca", "1");
  original["xl/worksheets/sheet1.xml"] = strToU8($sheet.xml());
  original["xl/metadata.xml"] = strToU8(
    '<metadata xmlns="urn:example"><futureMetadata name="XLDAPR"/></metadata>',
  );
  return Buffer.from(zipSync(original));
}
async function importedWorkbook() {
  const original = await sharedWorkbook(),
    imported = await importSpreadsheet(original),
    metadata: DocumentMetadata = {
      sourceName: "Formeln.xlsx",
      sheets: imported.sheets,
      warnings: imported.warnings,
    };
  return {
    original,
    imported,
    metadata,
    values: imported.document.getMap<Y.Map<string>>(SHEETS_MAP).get(imported.sheets[0].id)!,
  };
}
const sheetXml = (bytes: Buffer) =>
  load(strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]), { xmlMode: true });

describe("Excel formulas survive collaborative edits and downloads", () => {
  it("translates German functions only in code, preserving strings, quoted sheet names and tables", () => {
    expect(excelFormula('=WENN(A1;"SUMME(A1); ""WENN(""";\'SUMME(; WENN(\'!B1)')).toBe(
      'IF(A1,"SUMME(A1); ""WENN(""",\'SUMME(; WENN(\'!B1)',
    );
    expect(excelFormula("=SUMME(Tabelle1[SUMME(;WENN(];A1)")).toBe(
      "SUM(Tabelle1[SUMME(;WENN(],A1)",
    );
    expect(excelFormula("=ANZAHL2(A1;B1)+WENNFEHLER(C1;0)")).toBe("COUNTA(A1,B1)+IFERROR(C1,0)");
    expect(
      translateSharedFormula(
        'IF(A1="A1","SUMME(A1)",\'A1 SUMME(\'!$A1+B$1+$B$1+SUM(A:A)+SUM(1:1)+LOG10(A1))',
        "B1",
        "C2",
      ),
    ).toBe('IF(B2="A1","SUMME(A1)",\'A1 SUMME(\'!$A2+C$1+$B$1+SUM(B:B)+SUM(2:2)+LOG10(B2))');
  });
  it("imports a shared slave formula without shifting text literals or absolute references", async () => {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Tabelle");
    sheet.fillFormula("B1:B2", 'IF(A1="A1",$A1+A$1+$A$1,0)', [3, 4]);
    const imported = await importSpreadsheet(Buffer.from(await workbook.xlsx.writeBuffer()));
    try {
      const values = imported.document
        .getMap<Y.Map<string>>(SHEETS_MAP)
        .get(imported.sheets[0].id)!;
      expect(values.get("2:2")).toBe('=IF(A2="A1",$A2+A$1+$A$1,0)');
    } finally {
      imported.document.destroy();
    }
  });
  it("materializes the complete shared group when its master changes, preserving its slaves", async () => {
    const state = await importedWorkbook();
    try {
      state.values.set("1:2", "=A1*3");
      const peer = mergedDocument([encodeDocument(state.imported.document)]);
      peer.getMap<Y.Map<string>>(SHEETS_MAP).get(state.imported.sheets[0].id)!.set("2:1", "7");
      Y.applyUpdate(state.imported.document, Y.encodeStateAsUpdate(peer));
      peer.destroy();
      const result = await patchOriginalSpreadsheet(
          state.original,
          state.imported.document,
          state.metadata,
        ),
        xml = sheetXml(result),
        workbook = new ExcelJS.Workbook();
      expect(xml('c[r="B1"] f').text()).toBe("A1*3");
      expect(xml('c[r="B2"] f').text()).toBe("A2*2");
      expect(xml('c[r="B3"] f').text()).toBe("A3*2");
      expect(xml('c[r^="B"] f[t="shared"]').length).toBe(0);
      await workbook.xlsx.load(result as unknown as ExcelJS.Buffer);
      expect(workbook.getWorksheet("Stunden")!.getCell("B1").result).toBe(6);
      expect(workbook.getWorksheet("Stunden")!.getCell("B2").result).toBe(14);
      expect(workbook.getWorksheet("Stunden")!.getCell("C1").result).toBe(11);
    } finally {
      state.imported.document.destroy();
    }
  });
  it("materializes an edited shared slave and safely clears a deleted master", async () => {
    const state = await importedWorkbook();
    try {
      state.values.delete("1:2");
      state.values.set("2:2", "=A2*10");
      const xml = sheetXml(
        await patchOriginalSpreadsheet(state.original, state.imported.document, state.metadata),
      );
      expect(xml('c[r="B1"] f').length).toBe(0);
      expect(xml('c[r="B2"] f').text()).toBe("A2*10");
      expect(xml('c[r="B3"] f').text()).toBe("A3*2");
      expect(xml('f[t="shared"]').length).toBe(0);
    } finally {
      state.imported.document.destroy();
    }
  });
  it("preserves untouched shared and dynamic array metadata, source cache and package parts", async () => {
    const state = await importedWorkbook();
    try {
      const result = await patchOriginalSpreadsheet(
          state.original,
          state.imported.document,
          state.metadata,
        ),
        original = sheetXml(state.original),
        xml = sheetXml(result);
      expect(xml('c[r="B1"] f').toString()).toBe(original('c[r="B1"] f').toString());
      expect(xml('c[r="B2"] f').toString()).toBe(original('c[r="B2"] f').toString());
      expect(xml('c[r="F1"] f').toString()).toBe(original('c[r="F1"] f').toString());
      expect(xml('c[r="F1"]').attr("cm")).toBe("1");
      expect(xml('c[r="E1"] v').text()).toBe("200");
      expect(unzipSync(result)["xl/metadata.xml"]).toEqual(
        unzipSync(state.original)["xl/metadata.xml"],
      );
    } finally {
      state.imported.document.destroy();
    }
  });
  it("keeps unsupported expressions and array metadata but clears stale caches after input edits", async () => {
    const state = await importedWorkbook();
    try {
      state.values.set("1:1", "10");
      const xml = sheetXml(
        await patchOriginalSpreadsheet(state.original, state.imported.document, state.metadata),
      );
      expect(xml('c[r="E1"] f').text()).toBe("_xlfn.UNKNOWN(A1)");
      expect(xml('c[r="E1"] v').length).toBe(0);
      expect(xml('c[r="F1"] f').attr("t")).toBe("array");
      expect(xml('c[r="F1"] f').attr("ref")).toBe("F1:F2");
      expect(xml('c[r="F1"] f').attr("aca")).toBe("1");
      expect(xml('c[r="F1"] v,c[r="F2"] v').length).toBe(0);
      expect(xml('c[r="G1"] f').text()).toBe("SUM(F2)");
      expect(xml('c[r="G1"] v').length).toBe(0);
      expect(xml('c[r="H1"] f').text()).toBe("IFERROR(F2,99)");
      expect(xml('c[r="H1"] v').length).toBe(0);
      expect(xml('c[r="B1"] f').attr("t")).toBe("shared");
      expect(xml('c[r="B1"] v').text()).toBe("20");
    } finally {
      state.imported.document.destroy();
    }
  });
  it("identifies array result cells so dependent formulas cannot use their old numeric values", async () => {
    const state = await importedWorkbook();
    try {
      const sheets = state.imported.document.getMap<Y.Map<string>>(SHEETS_MAP),
        calculator = createSheetCalculator(sheets, state.imported.sheets),
        id = state.imported.sheets[0].id;
      expect(calculator.arrayAnchor(id, 2, 6)).toBe("1:6");
      expect(calculator.hasError(id, 2, 6)).toBe(true);
      expect(calculator.hasError(id, 1, 7)).toBe(true);
      expect(calculator.needsExcel(id, 2, 6)).toBe(true);
      expect(calculator.needsExcel(id, 1, 7)).toBe(true);
      expect(calculator.needsExcel(id, 1, 8)).toBe(true);
      expect(calculator(id, 1, 8)).not.toBe(99);
      state.values.set("1:6", "=A1*4");
      const updated = createSheetCalculator(sheets, state.imported.sheets);
      expect(updated.arrayAnchor(id, 2, 6)).toBeUndefined();
      expect(updated(id, 1, 6)).toBe(8);
    } finally {
      state.imported.document.destroy();
    }
  });
  it("exports unsupported formulas without error strings, including edited former text cells", async () => {
    const state = await importedWorkbook();
    try {
      state.values.set("2:3", "=NICHTVERFUEGBAR(A1)");
      state.values.set("3:3", '="#NAME?"');
      const xml = sheetXml(await exportSpreadsheet(state.imported.document, state.metadata));
      expect(xml('c[r="C2"] f').text()).toBe("NICHTVERFUEGBAR(A1)");
      expect(xml('c[r="C2"] v').length).toBe(0);
      expect(xml('c[r="C3"] v').text()).toBe("#NAME?");
      const patched = sheetXml(
        await exportSpreadsheet(state.imported.document, state.metadata, state.original),
      );
      expect(patched('c[r="C2"] f').text()).toBe("NICHTVERFUEGBAR(A1)");
      expect(patched('c[r="C2"]').attr("t")).not.toBe("inlineStr");
    } finally {
      state.imported.document.destroy();
    }
  });
  it("calculates quoted literals that look like error codes and reports actual unsupported functions", () => {
    const document = new Y.Doc(),
      sheets = document.getMap<Y.Map<string>>(SHEETS_MAP),
      values = new Y.Map<string>();
    sheets.set("1", values);
    values.set("1:1", '="#NAME?"');
    values.set("1:2", '=A1&" SUMME("');
    values.set("1:3", "=UNKNOWN(A1)");
    values.set("1:4", "=1/0");
    const calculator = createSheetCalculator(sheets, [
      { id: "1", name: "Tabelle", rows: 40, columns: 10 },
    ]);
    expect(calculator("1", 1, 2)).toBe("#NAME? SUMME(");
    expect(calculator.hasError("1", 1, 2)).toBe(false);
    expect(calculator.hasError("1", 1, 3)).toBe(true);
    expect(calculator.needsExcel("1", 1, 3)).toBe(true);
    expect(calculator.needsExcel("1", 1, 2)).toBe(false);
    expect(calculator.needsExcel("1", 1, 4)).toBe(false);
    document.destroy();
  });
});
