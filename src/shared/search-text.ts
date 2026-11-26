import { textValue, type DomainRecord, type RecordKind, type Workspace } from "./contracts";
import { documentSections, lookTitle, sectionName } from "./document-sections";
import { categoryName, type CategoryScope } from "./domain-categories";

/**
 * Human-readable search text for a record: its own words plus the names behind its references
 * (production, actor, figure, people, article …). IDs, JSON keys and technical codes are left
 * out, so searching "Lena" finds her Besetzungen and Aufschriebe but a UUID fragment does not.
 */

interface Lookup {
  names: Map<string, string>;
  calendarCategories: Map<string, string>;
}

const lookups = new WeakMap<Workspace, Lookup>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}|$)/;
/** Fields that only hold IDs, storage details or internal codes. */
const technicalKey =
  /^(?:id|key|version|path|mime|size|hash|color|order|status|category|recurrence|mode|type|scope|audience|link|portraitFileId|pendingDeletionOperation|recordKind|exceptions|until|start|end|date|due|premiere|createdAt|updatedAt|read|allDay|alternate|archived)$|Ids?$|Seconds$|Minutes$/;
const categoryScopes: Partial<Record<RecordKind, CategoryScope>> = {
  time: "time",
  materials: "materials",
  handovers: "handovers",
  looks: "looks",
};

function lookupFor(workspace: Workspace): Lookup {
  const cached = lookups.get(workspace);
  if (cached) return cached;
  const names = new Map<string, string>();
  const name = (record: DomainRecord) =>
    textValue(record.data.title).trim() || textValue(record.data.name).trim();
  for (const member of workspace.members) names.set(member.id, member.name);
  // Calendar references only carry titles; full production records take precedence below.
  for (const record of [
    ...(workspace.calendarProductions ?? []),
    ...(workspace.productionOverview ?? []),
  ])
    if (name(record)) names.set(record.id, name(record));
  for (const kind of [
    "productions",
    "actors",
    "characters",
    "people",
    "materials",
    "templates",
    "sprints",
    "tasks",
    "conversations",
  ] as const)
    for (const record of workspace.records[kind] ?? [])
      if (name(record)) names.set(record.id, name(record));
  const calendarCategories = new Map<string, string>();
  for (const record of workspace.records.calendarCategories ?? [])
    calendarCategories.set(textValue(record.data.key), textValue(record.data.name));
  const lookup = { names, calendarCategories };
  lookups.set(workspace, lookup);
  return lookup;
}

function collect(value: unknown, key: string, parts: string[], lookup: Lookup, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (/(?:Id|Ids|^id)$/.test(key) || uuid.test(text)) {
      const resolved = lookup.names.get(text);
      if (resolved) parts.push(resolved);
      return;
    }
    if (!text || technicalKey.test(key) || isoDate.test(text)) return;
    parts.push(text);
    return;
  }
  if (typeof value === "number") {
    if (!technicalKey.test(key) && !/quantity/i.test(key)) parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, parts, lookup, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      // Free-form maps such as template fields use the visible label as key.
      if (key === "templateFields" && typeof child === "string" && child.trim())
        parts.push(childKey);
      collect(child, childKey, parts, lookup, depth + 1);
    }
  }
}

/** Search text for one record, lower-cased for German. */
export function searchText(kind: RecordKind, record: DomainRecord, workspace: Workspace): string {
  const lookup = lookupFor(workspace);
  const parts: string[] = [];
  collect(record.data, "", parts, lookup);
  if (kind === "looks") {
    parts.push(lookTitle(record.data, workspace.records.actors));
    for (const section of documentSections(record.data, "looks"))
      parts.push(sectionName(section.key, "looks", workspace.records.categories));
  }
  if (kind === "handovers")
    for (const section of documentSections(record.data, "handovers"))
      parts.push(sectionName(section.key, "handovers", workspace.records.categories));
  const scope = categoryScopes[kind];
  const category = textValue(record.data.category);
  if (scope && category && kind !== "looks")
    parts.push(categoryName(scope, category, workspace.records.categories));
  if (kind === "events" && category) parts.push(lookup.calendarCategories.get(category) || "");
  return parts.filter(Boolean).join(" • ").toLocaleLowerCase("de");
}

/** Search terms for a query: every term must occur somewhere in the record text. */
export function searchTerms(query: string) {
  return query.trim().toLocaleLowerCase("de").split(/\s+/u).filter(Boolean);
}

export function matchesSearch(text: string, terms: readonly string[]) {
  return terms.every((term) => text.includes(term));
}

/** Precompute search text for a record list (call inside useMemo). */
export function searchIndex(kind: RecordKind, records: DomainRecord[], workspace: Workspace) {
  return new Map(records.map((record) => [record.id, searchText(kind, record, workspace)]));
}
