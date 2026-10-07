/**
 * Regular legal holidays for Ingolstadt under Bavaria's current FTG Art. 1.
 * Mariä Himmelfahrt applies in Ingolstadt; Augsburg's August 8 holiday does not.
 * Sources verified October 2026:
 * https://www.gesetze-bayern.de/Content/Document/BayFTG-1
 * https://www.statistik.bayern.de/statistik/gebiet_bevoelkerung/zensus/himmelfahrt/index.php?Suchfeld=gemeindename&feiertag=ja&sort=schluessel
 * These are date labels, never calendar records or automatic absence/working-time rules.
 */
const years = new Map<number, ReadonlyMap<string, string>>();

function easterSunday(year: number) {
  // Gregorian computus; all arithmetic and date shifts use UTC to avoid DST effects.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function holidays(year: number) {
  const existing = years.get(year);
  if (existing) return existing;
  const result = new Map<string, string>();
  const fixed = [
    ["01-01", "Neujahr"],
    ["01-06", "Heilige Drei Könige"],
    ["05-01", "Tag der Arbeit"],
    ["08-15", "Mariä Himmelfahrt"],
    ["10-03", "Tag der Deutschen Einheit"],
    ["11-01", "Allerheiligen"],
    ["12-25", "1. Weihnachtstag"],
    ["12-26", "2. Weihnachtstag"],
  ];
  for (const [date, name] of fixed) result.set(`${year}-${date}`, name);
  const easter = easterSunday(year);
  const relative: [number, string][] = [
    [-2, "Karfreitag"],
    [1, "Ostermontag"],
    [39, "Christi Himmelfahrt"],
    [50, "Pfingstmontag"],
    [60, "Fronleichnam"],
  ];
  for (const [offset, name] of relative) {
    const date = new Date(easter);
    date.setUTCDate(date.getUTCDate() + offset);
    result.set(date.toISOString().slice(0, 10), name);
  }
  if (years.size >= 24) years.delete(years.keys().next().value!);
  years.set(year, result);
  return result;
}

/** ISO local calendar date (YYYY-MM-DD), independent of browser/server timezone. */
export function bavarianHoliday(dateISO: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return undefined;
  const year = Number(dateISO.slice(0, 4));
  if (year < 1583) return undefined;
  return holidays(year).get(dateISO);
}
