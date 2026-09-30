import { describe, expect, it } from "vitest";
import { validateRecord } from "../src/modules/records/schemas";
import { contactsValue } from "../src/shared/contracts";

describe("production contact contracts", () => {
  it("keeps arbitrary roles and both account-linked and named makeup contacts", () => {
    const contacts = [
      { id: "direction", role: "Regie", type: "external", name: "Externe Regie", memberId: "" },
      {
        id: "custom",
        role: "Choreografie",
        type: "external",
        name: "Externer Kontakt",
        memberId: "",
      },
      { id: "makeup", role: "Maskenbetreuung", type: "makeup", name: "", memberId: "team-person" },
      { id: "guest", role: "Maskenassistenz", type: "makeup", name: "Gastassistenz", memberId: "" },
    ];
    expect(
      contactsValue(validateRecord("productions", { title: "Stück", contacts }).contacts),
    ).toEqual(contacts);
    expect(validateRecord("productions", { title: "Bestehendes Stück" }).contacts).toEqual([]);
  });

  it("rejects account references for external people and ambiguous makeup contacts", () => {
    for (const contact of [
      { id: "one", role: "Regie", type: "external", name: "Regie", memberId: "team-person" },
      { id: "one", role: "Regie", type: "external", name: "   ", memberId: "" },
      { id: "one", role: "Maske", type: "makeup", name: "", memberId: "" },
      { id: "one", role: "Maske", type: "makeup", name: "Name", memberId: "team-person" },
    ]) {
      expect(() =>
        validateRecord("productions", { title: "Stück", contacts: [contact] }),
      ).toThrow();
    }
  });

  it("rejects duplicate contact identifiers and missing roles", () => {
    const contact = { id: "one", role: "Kostüm", type: "external", name: "Kontakt", memberId: "" };
    expect(() =>
      validateRecord("productions", { title: "Stück", contacts: [contact, contact] }),
    ).toThrow();
    expect(() =>
      validateRecord("productions", { title: "Stück", contacts: [{ ...contact, role: " " }] }),
    ).toThrow();
  });

  it("preserves multiple figure and casting image references during edits", () => {
    for (const kind of ["characters", "casting"] as const) {
      const data = validateRecord(kind, {
        name: "Figur",
        productionId: "project",
        characterId: "character",
        actorId: "actor",
        imageIds: ["image-a", "image-b"],
      });
      expect(data.imageIds).toEqual(["image-a", "image-b"]);
      expect(validateRecord(kind, { ...data, alternate: true }).imageIds).toEqual([
        "image-a",
        "image-b",
      ]);
    }
  });
});
