"use client";
import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { ModuleSkeleton } from "./module-skeleton";

/**
 * Module screens and rarely opened dialogs are split into their own chunks. The first load
 * only carries the shell and Heute; bottom-navigation screens are prefetched while idle.
 *
 * Unlike next/dynamic (React.lazy + Suspense), a component whose chunk was already preloaded
 * renders synchronously. Suspending on an already loaded chunk would still show the fallback
 * and React then holds the content back for its ~300 ms reveal throttle on every first visit.
 */
function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ReactNode,
) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (component) => (loaded = component),
      (error) => {
        // A failed chunk request (offline, new deployment) may be retried later.
        pending = undefined;
        throw error;
      },
    ));
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));
  function LazyComponent(props: P) {
    // Decided once per mount so a later load never swaps the element type and its state.
    const [Ready] = useState(() => loaded);
    return Ready ? (
      <Ready {...props} />
    ) : (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Object.assign(LazyComponent, { preload });
}
const screen = <ModuleSkeleton />;
const dialog = null;

export const ProductionsModule = lazyComponent(
  () => import("./modules/productions").then((mod) => mod.ProductionsModule),
  screen,
);
export const CalendarModule = lazyComponent(
  () => import("./modules/calendar").then((mod) => mod.CalendarModule),
  screen,
);
export const TasksModule = lazyComponent(
  () => import("./modules/tasks").then((mod) => mod.TasksModule),
  screen,
);
export const TimeModule = lazyComponent(
  () => import("./modules/time").then((mod) => mod.TimeModule),
  screen,
);
export const ChatModule = lazyComponent(
  () => import("./modules/chat").then((mod) => mod.ChatModule),
  screen,
);
export const SettingsModule = lazyComponent(
  () => import("./modules/settings").then((mod) => mod.SettingsModule),
  screen,
);
export const ExportsModule = lazyComponent(
  () => import("./modules/exports").then((mod) => mod.ExportsModule),
  screen,
);
export const HelpModule = lazyComponent(
  () => import("@/modules/help/components/help-module").then((mod) => mod.HelpModule),
  screen,
);
export const DocumentationModule = lazyComponent(
  () =>
    import("@/modules/documentation/components/documentation-module").then(
      (mod) => mod.DocumentationModule,
    ),
  screen,
);
export const PeopleModule = lazyComponent(
  () => import("@/modules/people/components/people-module").then((mod) => mod.PeopleModule),
  screen,
);
export const ActorsModule = lazyComponent(
  () => import("@/modules/ensemble/components/actors-module").then((mod) => mod.ActorsModule),
  screen,
);
export const MaskPlansModule = lazyComponent(
  () =>
    import("@/modules/mask-plans/components/mask-plans-module").then((mod) => mod.MaskPlansModule),
  screen,
);
export const ProductionTeamModule = lazyComponent(
  () => import("./production-people").then((mod) => mod.ProductionTeamModule),
  screen,
);
export const RecordDocuments = lazyComponent(
  () =>
    import("@/modules/documents/components/record-documents").then((mod) => mod.RecordDocuments),
  screen,
);
export const BackstageChanges = lazyComponent(
  () =>
    import("@/modules/documentation/components/backstage-changes").then(
      (mod) => mod.BackstageChanges,
    ),
  screen,
);
export const ResourceView = lazyComponent(
  () => import("./resource-view").then((mod) => mod.ResourceView),
  screen,
);
export const RecordDetail = lazyComponent(
  () => import("./resource-view").then((mod) => mod.RecordDetail),
  dialog,
);
export const ResourceEditor = lazyComponent(
  () => import("./resource-editor").then((mod) => mod.ResourceEditor),
  dialog,
);
export const WorkspaceSearch = lazyComponent(
  () => import("./workspace-search").then((mod) => mod.WorkspaceSearch),
  dialog,
);
export const OnboardingTour = lazyComponent(
  () => import("@/modules/profile/components/onboarding-tour").then((mod) => mod.OnboardingTour),
  dialog,
);
export const ExportDialog = lazyComponent(
  () => import("./export-dialog").then((mod) => mod.ExportDialog),
  dialog,
);
export const ImportDialog = lazyComponent(
  () => import("./export-dialog").then((mod) => mod.ImportDialog),
  dialog,
);

const preloaders = {
  productions: ProductionsModule.preload,
  calendar: CalendarModule.preload,
  tasks: TasksModule.preload,
  time: TimeModule.preload,
  chat: ChatModule.preload,
  settings: SettingsModule.preload,
  exports: ExportsModule.preload,
  help: HelpModule.preload,
  documentation: DocumentationModule.preload,
  people: PeopleModule.preload,
  actors: ActorsModule.preload,
  resources: () => Promise.all([ResourceView.preload(), RecordDetail.preload()]),
} as const;
export type LazyModuleId = keyof typeof preloaders;

/** Load the chunks behind the given screens without rendering them. */
export function prefetchModules(ids: readonly LazyModuleId[]) {
  for (const id of ids) void preloaders[id]().catch(() => undefined);
}

/** Run once the main thread is idle, so prefetching never competes with the first paint. */
export function whenIdle(task: () => void, timeout = 2500) {
  if (typeof window === "undefined") return () => undefined;
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 1200);
  return () => clearTimeout(handle);
}
