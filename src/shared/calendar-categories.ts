import { textValue, type DomainRecord } from "./contracts";

export const defaultCalendarCategories = [
  { key: "service", name: "Dienst", color: "#377a68", allDay: false },
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

/** Half-day leave is a date marker, so a timed service can still occupy the working half. */
export function calendarCategoryBlocksTime(key: string, categories: DomainRecord[] = []) {
  const category = categories.find((row) => row.data.key === key)?.data;
  return typeof category?.blocksTime === "boolean" ? category.blocksTime : key !== "half-day-off";
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
