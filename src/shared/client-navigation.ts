import { useMemo, useSyncExternalStore, type MouseEvent } from "react";
import type { DomainRecord } from "./contracts";
import { value } from "./client-api";

interface NavigationContext {
  returnTo?: string;
  returnLabel?: string;
  scroll?: { x: number; y: number };
}
const contextKey = "digitalmaskNavigation";
/** Fired after in-app history changes; real Back/Forward fire popstate. */
export const locationEvent = "digitalmask:location";
let navigationUser = "";
export function setNavigationUser(userId: string) {
  navigationUser = userId;
}
export const locationPath = () => location.pathname + location.search + location.hash;
const scrollKey = () =>
  `digitalmask-view:${navigationUser}:scroll:${(location.pathname + routeSearch(location.search) + location.hash).replace(/([?&])record=[^&]*&?/, "$1")}`;
function context(): NavigationContext {
  return history.state?.[contextKey] || {};
}
function notifyLocation() {
  window.dispatchEvent(new Event(locationEvent));
}
/** Location changes from Back/Forward and from the helpers below. */
export function subscribeLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(locationEvent, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(locationEvent, callback);
  };
}
/**
 * Writes only the app's own state object. Next.js copies its router internals into the entry
 * and updates its router URL itself; copying history.state (with Next's __NA flag) would skip
 * that and leave Next with a stale URL that it could later write back.
 */
function pushEntry(href: string, metadata: NavigationContext) {
  history.pushState({ [contextKey]: metadata }, "", href);
  notifyLocation();
}
export function captureNavigationScroll() {
  const scroll = { x: window.scrollX, y: window.scrollY };
  history.replaceState({ ...history.state, [contextKey]: { ...context(), scroll } }, "");
  if (navigationUser) {
    try {
      sessionStorage.setItem(scrollKey(), JSON.stringify(scroll));
    } catch {}
  }
}
export function navigationReturn() {
  const previous = context();
  return previous.returnTo
    ? { href: previous.returnTo, label: previous.returnLabel || "Zurück" }
    : null;
}
export function navigateWorkspace(
  href: string,
  options: { returnLabel?: string; retainOrigin?: boolean } = {},
) {
  captureNavigationScroll();
  const from = locationPath();
  if (from === href) return;
  const metadata: NavigationContext =
    options.retainOrigin === false ? {} : { returnTo: from, returnLabel: options.returnLabel };
  pushEntry(href, metadata);
}
/**
 * Change the current entry's URL (filters, selection, calendar view). `silent` skips the
 * in-app location event for presentation-only parameters nobody else routes on.
 */
export function replaceWorkspaceUrl(href: string, options: { silent?: boolean } = {}) {
  if (locationPath() === href) return;
  history.replaceState({ [contextKey]: context() }, "", href);
  if (!options.silent) notifyLocation();
}
export function returnToContext(fallback: string) {
  if (navigationReturn()) history.back();
  else navigateWorkspace(fallback, { retainOrigin: false });
}
export function closeRecordDetail() {
  if (navigationReturn()) {
    history.back();
    return;
  }
  const next = new URL(location.href);
  ["record", "relatedSeason", "relatedYear"].forEach((key) => next.searchParams.delete(key));
  replaceWorkspaceUrl(next.pathname + next.search);
}

/** Plain primary clicks navigate in place; modified clicks keep the browser's link behaviour. */
export function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.target === "_blank" ||
    event.currentTarget.hasAttribute("download")
  );
}

/** Module entry URL as used by the navigation and deep links. */
export const moduleHref = (module: string) => (module === "today" ? "/" : `/?module=${module}`);

/** Parameters that only change how a screen is presented; they do not route the shell. */
const presentationParams = ["view", "date", "span"];
export function routeSearch(search: string) {
  const params = new URLSearchParams(search);
  for (const key of presentationParams) params.delete(key);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The workspace route (?module=…&productionId=…&tab=…&record=…) as React state, plus the
 * navigation helpers. Presentation parameters such as the calendar view are excluded, so
 * changing them does not re-render the shell.
 */
export function useWorkspaceLocation() {
  const search = useSyncExternalStore(
    subscribeLocation,
    () => routeSearch(location.search),
    () => "",
  );
  const params = useMemo(() => new URLSearchParams(search), [search]);
  return {
    search,
    params,
    navigate: navigateWorkspace,
    replace: replaceWorkspaceUrl,
  };
}

/** Restore the actual history entry, including Back from a linked detail dialog. */
export function restoreNavigationScroll(targetId?: string) {
  let saved = context().scroll;
  if (!saved && !targetId && navigationUser) {
    try {
      saved = JSON.parse(sessionStorage.getItem(scrollKey()) || "null") || undefined;
    } catch {}
  }
  const frame = requestAnimationFrame(() => {
    const target = !saved && targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center", behavior: "instant" });
    } else window.scrollTo({ left: saved?.x || 0, top: saved?.y || 0, behavior: "instant" });
  });
  return () => cancelAnimationFrame(frame);
}

const productionTabs: Record<string, string> = {
  tasks: "tasks",
  sprints: "tasks",
  characters: "casting",
  casting: "casting",
  maskPlans: "mask-plan",
  looks: "looks",
  events: "calendar",
  time: "time",
  messages: "chat",
};
const modules: Record<string, string> = {
  handovers: "handovers",
  people: "people",
  feedback: "help",
  attendance: "time",
  conversations: "chat",
  productions: "productions",
  actors: "actors",
  tasks: "tasks",
  materials: "inventory",
  looks: "documentation",
  templates: "documentation",
  events: "calendar",
  time: "time",
  messages: "chat",
};
export function recordHref(record: DomainRecord) {
  if (record.kind === "reservations") {
    const materialId = value(record.data, "materialId");
    return `/?${new URLSearchParams({ module: "inventory", ...(materialId ? { record: materialId } : {}) })}`;
  }
  if (record.kind === "shiftSwaps") {
    return `/?${new URLSearchParams({ module: "calendar", swapId: record.id })}`;
  }
  const conversationId =
    record.kind === "conversations" ? record.id : value(record.data, "conversationId");
  if (conversationId) {
    return `/?${new URLSearchParams({ module: "chat", conversationId })}`;
  }
  const productionId =
    record.kind === "handovers"
      ? ""
      : record.kind === "productions"
        ? record.id
        : value(record.data, "productionId");
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

/** Links retain the real source route, including its production tab and filters. */
export function navigateRecord(
  record: DomainRecord,
  options: { from?: DomainRecord; beforeNavigate?: () => void } = {},
) {
  const current = new URL(location.href);
  if (
    options.from &&
    current.searchParams.get("record") !== options.from.id &&
    options.from.kind !== "productions"
  ) {
    captureNavigationScroll();
    current.searchParams.set("record", options.from.id);
    pushEntry(current.pathname + current.search, { ...context(), returnTo: locationPath() });
  }
  options.beforeNavigate?.();
  navigateWorkspace(recordHref(record));
}
