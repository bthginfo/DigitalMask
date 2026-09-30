import { textValue, type DomainRecord } from "./contracts";
import { documentSectionDefaults } from "./document-sections";

export const categoryScopes = ["time", "materials", "looks", "handovers"] as const;
export type CategoryScope = (typeof categoryScopes)[number];
export const defaultDomainCategories = [
  { scope: "time", key: "production", name: "Produktion", color: "#377a68", order: 0 },
  { scope: "time", key: "office", name: "Büro", color: "#537fba", order: 1 },
  { scope: "time", key: "cleaning", name: "Aufräumen", color: "#ac8235", order: 2 },
  { scope: "time", key: "other", name: "Sonstiges", color: "#77818e", order: 3 },
  { scope: "materials", key: "wig", name: "Perücke", color: "#8c74ad", order: 0 },
  { scope: "materials", key: "makeup", name: "Makeup", color: "#ad698b", order: 1 },
  { scope: "materials", key: "tool", name: "Werkzeug", color: "#ac8235", order: 2 },
  { scope: "materials", key: "other", name: "Sonstiges", color: "#77818e", order: 3 },
  ...(["looks", "handovers"] as const).flatMap((scope) =>
    documentSectionDefaults[scope].map((section, order) => ({
      scope,
      ...section,
      color: "#377a68",
      order,
    })),
  ),
] as const;

export function categoryName(scope: CategoryScope, key: string, categories: DomainRecord[] = []) {
  return (
    textValue(
      categories.find((row) => row.data.scope === scope && row.data.key === key)?.data.name,
    ) ||
    defaultDomainCategories.find((item) => item.scope === scope && item.key === key)?.name ||
    key
  );
}

/** Fallbacks support old fixtures; an existing collection is authoritative, including an empty scope. */
export function categoriesFor(scope: CategoryScope, categories?: DomainRecord[]) {
  return categories === undefined
    ? defaultDomainCategories.filter((item) => item.scope === scope)
    : categories
        .filter((row) => row.data.scope === scope)
        .map((row) => ({
          key: textValue(row.data.key),
          name: textValue(row.data.name),
          color: textValue(row.data.color),
          order: Number(row.data.order || 0),
        }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "de"));
}
