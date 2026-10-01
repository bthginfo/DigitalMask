import { describe, expect, it } from "vitest";
import {
  mergePersonData,
  personNameKey,
  replacePersonReferences,
  personNameMatches,
  uniqueMemberForContact,
} from "../src/shared/person-identity";

describe("contact consolidation", () => {
  it("links surname initials and umlaut spelling only to an unambiguous member", () => {
    expect(personNameMatches("Julia G.", "Julia Gottloeber")).toBe(true);
    expect(personNameMatches("Julia Gottlöber", "Julia Gottloeber")).toBe(true);
    expect(personNameMatches("Julia", "Julia Gottloeber")).toBe(false);
    const members = [{ id: "one", name: "Julia Gottloeber" }];
    expect(uniqueMemberForContact("Julia G.", members)?.id).toBe("one");
    expect(
      uniqueMemberForContact("Julia G.", [...members, { id: "two", name: "Julia Graf" }]),
    ).toBeUndefined();
    expect(
      uniqueMemberForContact("Julia G.", members, ["Julia Gottloeber", "Julia Graf"]),
    ).toBeUndefined();
    expect(uniqueMemberForContact("Julia Gottloeber", members, ["Julia Graf"])?.id).toBe("one");
  });
  it("recognizes equivalent names without fuzzy matching different people", () => {
    expect(personNameKey("  Julia  Gottloeber ")).toBe(personNameKey("JULIA Gottloeber"));
    expect(personNameKey("Laura Eckenigk")).not.toBe(personNameKey("Laura Eckenig"));
  });
  it("preserves alternate details and notes", () => {
    const merged = mergePersonData({ name: "Person", email: "a@example.com", notes: "Original" }, [
      { email: "b@example.com", phone: "123", position: "Regie", notes: "Zusatz" },
    ]);
    expect(merged.email).toBe("a@example.com");
    expect(merged.phone).toBe("123");
    expect(merged.notes).toContain("b@example.com");
    expect(merged.notes).toContain("Original");
    expect(merged.notes).toContain("Zusatz");
  });
  it("relinks nested production/file references without touching user text", () => {
    expect(
      replacePersonReferences(
        {
          contacts: [{ id: "contact", personId: "old", role: "Regie" }],
          recordId: "old",
          notes: "old",
        },
        new Map([["old", "canonical"]]),
      ),
    ).toEqual({
      contacts: [{ id: "contact", personId: "canonical", role: "Regie" }],
      recordId: "canonical",
      notes: "old",
    });
  });
});
