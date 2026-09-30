import { describe, expect, it } from "vitest";
import { emailHref, phoneHref, filterPeople } from "../src/modules/people/components/person-data";
import type { DomainRecord } from "../src/shared/contracts";

const person = (id: string, data: DomainRecord["data"]): DomainRecord => ({
  id,
  data,
  kind: "people",
  organizationId: "fiction",
  departmentId: "maske",
  createdBy: "fixture",
  createdAt: "2026-09-30T10:00:00Z",
  updatedAt: "2026-09-30T10:00:00Z",
  version: 1,
});
describe("contact directory links and local search", () => {
  it("creates only safe mail links without injected mail headers or script URLs", () => {
    expect(emailHref("  aenne.mueller@example.test  ")).toBe("mailto:aenne.mueller@example.test");
    expect(emailHref("Änne.Müller@example.test")).toBe("mailto:%C3%84nne.M%C3%BCller@example.test");
    for (const value of [
      "javascript:alert(1)",
      "a@example.test?bcc=other@example.test",
      "a@example.test\r\nBcc:other@example.test",
      "a@example.test%0d%0aBcc:other@example.test",
      "a@example.test#fragment",
      "",
      "a@example.test&body=text",
    ])
      expect(emailHref(value)).toBeUndefined();
  });
  it("normalizes printable phone numbers including optional international trunk prefixes", () => {
    expect(phoneHref("+49 (0) 30 / 123-456")).toBe("tel:+4930123456");
    expect(phoneHref("030 / 12345")).toBe("tel:03012345");
    for (const value of [
      "javascript:alert(1)",
      "*21*004912345#",
      "123,456",
      "12",
      "++493012345",
      "123 ext 5",
      "+49 30 123 (office)",
    ])
      expect(phoneHref(value)).toBeUndefined();
  });
  it("searches all relevant cached fields, combines terms and filters exact organizations", () => {
    const records = [
      person("b", {
        name: "Berta Fiktiv",
        organization: "Theater B",
        position: "Regie",
        notes: "Abends erreichbar",
      }),
      person("a", {
        name: "Änne Fiktiv",
        organization: "Theater A",
        position: "Kostüm",
        email: "aenne@example.test",
        phone: "03012345",
      }),
      person("c", { name: "Clara Fiktiv", organization: "Theater A", position: "Regie" }),
      { ...person("task", { name: "Fiktive Regie" }), kind: "tasks" as const },
    ];
    expect(filterPeople(records, "REGIE abends").map((row) => row.id)).toEqual(["b"]);
    expect(filterPeople(records, "theater", "Theater A").map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterPeople(records, "03012345").map((row) => row.id)).toEqual(["a"]);
    expect(filterPeople(records, "aenne@example.test").map((row) => row.id)).toEqual(["a"]);
    expect(filterPeople(records, "unbekannt")).toEqual([]);
    expect(records.map((row) => row.id)).toEqual(["b", "a", "c", "task"]);
  });
});
