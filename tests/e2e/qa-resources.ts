import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function trackQaResources(...items: { kind: string; id: string }[]) {
  mkdirSync(path.resolve(".local"), { recursive: true });
  appendFileSync(
    path.resolve(".local/qa-resources.jsonl"),
    items.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "utf8",
  );
}
/** Ignored local journal permits exact cleanup of audit/outbox entries from real API tests. */
export function qaResources() {
  const list: { kind: string; id: string }[] = [];
  const append = list.push;
  list.push = (...items) => {
    trackQaResources(...items);
    return append.apply(list, items);
  };
  return list;
}
