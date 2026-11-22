import { describe, expect, it, vi } from "vitest";
import { validateCategoryReferences } from "@/modules/categories/service";
import type { Context } from "@/platform/context";
import type { Transaction } from "@/platform/db";
import { backstageChangesSection } from "@/shared/document-sections";

const context = { departmentId: "maske" } as Context;
const change = {
  key: backstageChangesSection.key,
  entries: [{ id: "first", text: "Perücke wechseln" }],
};

function categoryStore(...keys: string[]) {
  const rows = keys.map((key) => ({ data: { key } }));
  const select = vi.fn(() => ({ from: () => ({ where: async () => rows }) }));
  return { select, tx: { execute: vi.fn(), select } as unknown as Transaction };
}

describe("category validation when saving backstage changes", () => {
  it("accepts a standalone change without a category lookup or cue", async () => {
    const { tx, select } = categoryStore();
    await validateCategoryReferences(context, "looks", { sections: [change] }, tx);
    expect(select).not.toHaveBeenCalled();
  });

  it("accepts a change with a cue alongside registered sections of an existing note", async () => {
    const { tx, select } = categoryStore("hair");
    const sections = [
      { key: "hair", entries: [{ id: "braid", text: "Flechten" }] },
      { ...change, entries: [{ ...change.entries[0], label: "10 min nach Beginn" }] },
    ];
    await validateCategoryReferences(context, "looks", { sections }, tx);
    expect(select).toHaveBeenCalledOnce();
  });

  it("continues to reject unknown categories and out-of-scope sections", async () => {
    const { tx } = categoryStore();
    await expect(
      validateCategoryReferences(
        context,
        "looks",
        { sections: [change, { ...change, key: "unknown" }] },
        tx,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      validateCategoryReferences(context, "handovers", { sections: [change] }, tx),
    ).rejects.toMatchObject({ status: 400 });
  });
});
