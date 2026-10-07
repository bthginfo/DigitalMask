import { describe, expect, test } from "vitest";
import { bavarianHoliday } from "../src/shared/bavarian-holidays";

describe("Ingolstadt calendar holiday labels", () => {
  test.each([
    ["2026-01-01", "Neujahr"],
    ["2026-01-06", "Heilige Drei Könige"],
    ["2026-04-03", "Karfreitag"],
    ["2026-04-06", "Ostermontag"],
    ["2026-05-01", "Tag der Arbeit"],
    ["2026-05-14", "Christi Himmelfahrt"],
    ["2026-05-25", "Pfingstmontag"],
    ["2026-06-04", "Fronleichnam"],
    ["2026-08-15", "Mariä Himmelfahrt"],
    ["2026-10-03", "Tag der Deutschen Einheit"],
    ["2026-11-01", "Allerheiligen"],
    ["2026-12-25", "1. Weihnachtstag"],
    ["2026-12-26", "2. Weihnachtstag"],
    ["2027-03-26", "Karfreitag"],
    ["2027-03-29", "Ostermontag"],
    ["2027-05-06", "Christi Himmelfahrt"],
    ["2027-05-17", "Pfingstmontag"],
    ["2027-05-27", "Fronleichnam"],
    ["2028-04-17", "Ostermontag"],
    ["2000-04-24", "Ostermontag"],
  ])("%s is %s regardless of local DST", (date, name) => {
    expect(bavarianHoliday(date)).toBe(name);
  });

  test("year boundaries and unrelated observances never become holidays", () => {
    for (const date of [
      "2025-12-31",
      "2026-01-02",
      "2026-08-08", // Augsburg only.
      "2026-04-05", // Easter Sunday is not an additional FTG Art. 1 holiday.
      "2026-05-24", // Pentecost Sunday likewise.
      "2026-10-31", // Reformation Day is not a regular Bavarian holiday.
      "2026-11-18", // Buß- und Bettag is not a legal holiday for employees.
      "2026-12-24",
      "2026-12-31",
      "2026-02-30",
      "not-a-date",
      "2026-01-01T00:00:00Z",
    ])
      expect(bavarianHoliday(date)).toBeUndefined();
    expect(bavarianHoliday("2027-01-01")).toBe("Neujahr");
    expect(bavarianHoliday("2027-01-06")).toBe("Heilige Drei Könige");
  });
});
