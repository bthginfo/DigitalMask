import { textValue, type DomainRecord, type RecordData, type RecordKind } from "./contracts";

export const defaultCalendarCategories = [
  { key: "service", name: "Dienst", color: "#377a68", allDay: false, blocksTime: false },
  { key: "rehearsal", name: "Probe", color: "#537fba", allDay: false },
  { key: "performance", name: "Vorstellung", color: "#ad698b", allDay: false },
  { key: "preparation", name: "Vorbereitung", color: "#ac8235", allDay: false },
  { key: "absence", name: "Abwesenheit", color: "#77818e", allDay: true },
  { key: "absent", name: "Absent", color: "#b86d73", allDay: true },
  { key: "abf", name: "ABF", color: "#8c74ad", allDay: true },
  { key: "rest", name: "Ruhetag", color: "#758f8a", allDay: true },
  {
    key: "half-day-off",
    name: "Halber freier Tag",
    color: "#ba9560",
    allDay: true,
    blocksTime: false,
  },
  { key: "vacation", name: "Urlaub", color: "#5c92a8", allDay: true },
] as const;

const normalizedCategory = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
const serviceNames = new Set(["service", "dienst", "tagesdienst", "td"]);
const halfDayNames = new Set(["halfdayoff", "halberfreiertag"]);
const absenceKeys = new Set(["absence", "absent", "abf", "rest", "vacation"]);
export type CalendarBackground = "service" | "hint" | undefined;

// Accept older open forms and historical payloads while only storing the neutral category.
const legacyAbsentNames = new Set([
  "sick",
  "krank",
  "krankmitattest",
  "krankohneattest",
  "krankmitohneattest",
  "krankmitoderohneattest",
  "sickwithcertificate",
  "sickwithoutcertificate",
]);
const paidDayNames = new Set([
  "vacation",
  "urlaub",
  "absent",
  ...legacyAbsentNames,
  "holiday",
  "publicholiday",
  "feiertag",
  "holidaycompensation",
  "feiertagsausgleich",
]);
const unpaidDayNames = new Set(["abf", "rest", "ruhetag", "halfdayoff", "halberfreiertag", "hft"]);

export function calendarCategoryKey(key: string) {
  return key === "sick" ? "absent" : key;
}

function neutralAbsentLabel(label: string) {
  return legacyAbsentNames.has(normalizedCategory(label).replace(/[^a-z0-9]/g, ""))
    ? "Absent"
    : label;
}

/** Canonicalizes category fields and generated notices, leaving people's free text untouched. */
export function neutralCalendarData(kind: RecordKind, data: RecordData): RecordData {
  if (kind === "calendarCategories" && data.key === "sick")
    return { ...data, key: "absent", name: "Absent" };
  if (kind === "calendarCategories" && data.key === "absent" && typeof data.name === "string") {
    const name = neutralAbsentLabel(data.name);
    if (name !== data.name) return { ...data, name };
  }
  if (kind === "events" && calendarCategoryKey(textValue(data.category)) === "absent") {
    const category = "absent";
    const title = typeof data.title === "string" ? neutralAbsentLabel(data.title) : data.title;
    if (category !== data.category || title !== data.title)
      return { ...data, category, ...(typeof data.title === "string" ? { title } : {}) };
  }
  if (
    kind === "notifications" &&
    data.type === "ServiceChangedV1" &&
    typeof data.body === "string"
  ) {
    const body = neutralAbsentLabel(data.body);
    if (body !== data.body) return { ...data, body };
  }
  return data;
}

/** Custom category IDs stay unchanged; named paid days use the same six-day credit rule. */
export function calendarCategoryCreditsTime(key: string, definition: RecordData = {}) {
  const names = [key, textValue(definition.name)].map((name) =>
    normalizedCategory(name).replace(/[^a-z0-9]/g, ""),
  );
  if (names.some((name) => unpaidDayNames.has(name))) return false;
  return names.some((name) => paidDayNames.has(name));
}

/** Recognizes existing named categories without rewriting their records or stored events. */
export function calendarCategoryBehavior(key: string, definition: RecordData = {}) {
  const names = [normalizedCategory(key), normalizedCategory(textValue(definition.name))];
  const background: CalendarBackground = absenceKeys.has(calendarCategoryKey(key))
    ? undefined
    : names.some((name) => halfDayNames.has(name))
      ? "hint"
      : names.some((name) => serviceNames.has(name))
        ? "service"
        : undefined;
  return {
    background,
    blocksTime: background ? false : definition.blocksTime !== false,
  };
}

/** Working-time backgrounds and half-free-day hints leave room for actual appointments. */
export function calendarCategoryBlocksTime(key: string, categories: DomainRecord[] = []) {
  const category = categories.find(
    (row) => calendarCategoryKey(textValue(row.data.key)) === calendarCategoryKey(key),
  )?.data;
  return calendarCategoryBehavior(key, category).blocksTime;
}

/** Uses cached workspace references; no database call for a label, legend or export. */
export function calendarPresentation(
  event: DomainRecord,
  productions: DomainRecord[] = [],
  categories: DomainRecord[] = [],
) {
  const data = neutralCalendarData("events", event.data);
  const key = calendarCategoryKey(textValue(data.category, "service"));
  const definition = categories.find((row) => calendarCategoryKey(textValue(row.data.key)) === key);
  const category = definition && neutralCalendarData("calendarCategories", definition.data);
  const fallback = defaultCalendarCategories.find((row) => row.key === key);
  const name = textValue(category?.name, fallback?.name || key);
  const production = productions.find((row) => row.id === event.data.productionId);
  const productionTitle = textValue(production?.data.title).trim();
  const customTitle = textValue(data.title).trim();
  const combinedTitle = productionTitle ? `${productionTitle} – ${name}` : "";
  const title = combinedTitle
    ? customTitle && customTitle !== productionTitle && customTitle !== combinedTitle
      ? `${combinedTitle} · ${customTitle}`
      : combinedTitle
    : customTitle || name;
  return {
    ...calendarCategoryBehavior(key, category),
    title,
    categoryName: name,
    color:
      textValue(production?.data.color).trim() ||
      textValue(category?.color, fallback?.color || "#77818e"),
    allDay:
      event.data.allDay === true ||
      category?.allDay === true ||
      (!category && fallback?.allDay === true),
  };
}
