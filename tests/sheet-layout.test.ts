import { describe, expect, it } from "vitest";
import {
  createSheetLayout,
  nextSheetCell,
  pasteIntersectsMerge,
  sheetMaster,
  visibleSheetCell,
} from "@/modules/documents/sheet-layout";

describe("merged worksheet editing", () => {
  it("renders a continued merge once on each page while preserving its master", () => {
    const layout = createSheetLayout({ merges: ["C48:G54"] }, 80, 10);
    expect(visibleSheetCell(layout, 48, 3, 1, 50)).toMatchObject({
      rowSpan: 3,
      colSpan: 5,
      master: { row: 48, column: 3 },
    });
    expect(visibleSheetCell(layout, 51, 3, 51, 80)).toMatchObject({
      rowSpan: 4,
      colSpan: 5,
      master: { row: 48, column: 3 },
    });
    expect(visibleSheetCell(layout, 51, 4, 51, 80)).toBeNull();
    expect(visibleSheetCell(layout, 52, 3, 51, 80)).toBeNull();
    expect(sheetMaster(layout, 54, 7)).toEqual({ row: 48, column: 3 });
  });

  it("moves outside a merged rectangle and enters another merge through its master", () => {
    const layout = createSheetLayout({ merges: ["C2:G4", "H2:I3"] }, 80, 10);
    expect(nextSheetCell(layout, { row: 3, column: 4 }, "right", 80, 10)).toEqual({
      row: 2,
      column: 8,
    });
    expect(nextSheetCell(layout, { row: 2, column: 3 }, "down", 80, 10)).toEqual({
      row: 5,
      column: 3,
    });
    expect(nextSheetCell(layout, { row: 2, column: 3 }, "left", 80, 10)).toEqual({
      row: 2,
      column: 2,
    });
    expect(nextSheetCell(layout, { row: 2, column: 3 }, "up", 80, 10)).toEqual({
      row: 1,
      column: 3,
    });
  });

  it("rejects a paste entering any covered cell but allows ordinary and single-cell targets", () => {
    const layout = createSheetLayout({ merges: ["C2:G2"] }, 80, 10);
    expect(pasteIntersectsMerge(layout, { row: 2, column: 2 }, [["left", "master"]])).toBe(true);
    expect(pasteIntersectsMerge(layout, { row: 2, column: 5 }, [["covered", "covered"]])).toBe(
      true,
    );
    expect(pasteIntersectsMerge(layout, { row: 1, column: 3 }, [["above"], ["master"]])).toBe(true);
    expect(pasteIntersectsMerge(layout, { row: 3, column: 3 }, [["one", "two"]])).toBe(false);
    expect(pasteIntersectsMerge(layout, { row: 2, column: 3 }, [["one value"]])).toBe(false);
  });

  it("bounds malformed, overlapping and out-of-sheet merge metadata", () => {
    const layout = createSheetLayout(
      { merges: ["$AA$8:$AB$12", "AA9:AC11", "A0:B2", "C1:bad", "A99999999:B99999999"] },
      10,
      28,
    );
    expect(layout.merges).toHaveLength(1);
    expect(visibleSheetCell(layout, 8, 27, 1, 10)).toMatchObject({ rowSpan: 3, colSpan: 2 });
    expect(layout.covered.size).toBe(6);
  });
});
