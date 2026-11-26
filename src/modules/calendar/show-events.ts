import { textValue, type DomainRecord, type RecordData } from "@/shared/contracts";
import { calendarCategoryKey } from "@/shared/calendar-categories";

const normalized = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const showNames = new Set([
  "performance",
  "vorstellung",
  "vorstellungen",
  "premiere",
  "rehearsal",
  "probe",
  "proben",
  "hp",
  "hp1",
  "hp2",
  "gp",
  "ama",
]);

/**
 * Performances and rehearsals (Vorstellung, Premiere, Probe, HP, GP, AMA …) are the evenings a
 * mask plan is made for. Custom categories are recognised by their stored key or visible name.
 */
export function isShowCategory(key: string, definition: RecordData = {}) {
  return [calendarCategoryKey(key), textValue(definition.name)].some((label) => {
    const name = normalized(label);
    if (name.includes("frei") || name.includes("ausfall")) return false;
    return (
      showNames.has(name) ||
      name.includes("vorstellung") ||
      name.includes("probe") ||
      name.includes("premiere") ||
      name.includes("rehearsal") ||
      name.includes("performance")
    );
  });
}

export function isShowEvent(event: Pick<DomainRecord, "data">, categories: DomainRecord[] = []) {
  const key = calendarCategoryKey(textValue(event.data.category));
  const definition = categories.find(
    (row) => calendarCategoryKey(textValue(row.data.key)) === key,
  )?.data;
  return isShowCategory(key, definition);
}
