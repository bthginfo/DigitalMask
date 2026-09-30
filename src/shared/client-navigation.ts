import type { DomainRecord } from "./contracts";
import { value } from "./client-api";

const productionTabs: Record<string, string> = {
  tasks: "tasks",
  sprints: "tasks",
  characters: "casting",
  casting: "casting",
  looks: "looks",
  events: "calendar",
  time: "time",
  handovers: "handovers",
  messages: "chat",
};
const modules: Record<string, string> = {
  productions: "productions",
  actors: "actors",
  tasks: "tasks",
  materials: "inventory",
  looks: "documentation",
  templates: "documentation",
  events: "calendar",
  time: "time",
  handovers: "handovers",
  messages: "chat",
};
export function recordHref(record: DomainRecord) {
  const productionId =
    record.kind === "productions" ? record.id : value(record.data, "productionId");
  const query = new URLSearchParams(
    productionId
      ? {
          module: "productions",
          productionId,
          tab: productionTabs[record.kind] || "overview",
          ...(record.kind === "productions" ? {} : { record: record.id }),
        }
      : { module: modules[record.kind] || "today", record: record.id },
  );
  return `/?${query}`;
}
