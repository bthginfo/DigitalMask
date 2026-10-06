import { textValue, type DomainRecord, type RecordData } from "./contracts";

export const defaultCalendarCategories = [
  { key: "service", name: "Dienst", color: "#377a68", allDay: false, blocksTime: false },
  { key: "rehearsal", name: "Probe", color: "#537fba", allDay: false },
  { key: "performance", name: "Vorstellung", color: "#ad698b", allDay: false },
  { key: "preparation", name: "Vorbereitung", color: "#ac8235", allDay: false },
  { key: "absence", name: "Abwesenheit", color: "#77818e", allDay: true },
  { key: "sick", name: "Krank", color: "#b86d73", allDay: true },
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
const absenceKeys = new Set(["absence", "sick", "abf", "rest", "vacation"]);
export type CalendarBackground = "service" | "hint" | undefined;

/** Recognizes existing named categories without rewriting their records or stored events. */
export function calendarCategoryBehavior(key: string, definition: RecordData = {}) {
  const names = [normalizedCategory(key), normalizedCategory(textValue(definition.name))];
  const background: CalendarBackground = absenceKeys.has(key)
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
  const category = categories.find((row) => row.data.key === key)?.data;
  return calendarCategoryBehavior(key, category).blocksTime;
}

/** Uses cached workspace references; no database call for a label, legend or export. */
export function calendarPresentation(
  event: DomainRecord,
  productions: DomainRecord[] = [],
  categories: DomainRecord[] = [],
) {
  const key = textValue(event.data.category, "service");
  const category = categories.find((row) => row.data.key === key)?.data;
  const fallback = defaultCalendarCategories.find((row) => row.key === key);
  const name = textValue(category?.name, fallback?.name || key);
  const production = productions.find((row) => row.id === event.data.productionId);
  const productionTitle = textValue(production?.data.title).trim();
  const customTitle = textValue(event.data.title).trim();
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
