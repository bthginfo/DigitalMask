"use client";
import dynamic from "next/dynamic";
import { ModuleSkeleton } from "./module-skeleton";

/**
 * Module screens and rarely opened dialogs are split into their own chunks. The first load
 * only carries the shell and Heute; bottom-navigation screens are prefetched while idle.
 */
const screenLoading = () => <ModuleSkeleton />;
const dialogLoading = () => null;

export const moduleLoaders = {
  productions: () => import("./modules/productions"),
  calendar: () => import("./modules/calendar"),
  tasks: () => import("./modules/tasks"),
  time: () => import("./modules/time"),
  chat: () => import("./modules/chat"),
  settings: () => import("./modules/settings"),
  exports: () => import("./modules/exports"),
  help: () => import("@/modules/help/components/help-module"),
  documentation: () => import("@/modules/documentation/components/documentation-module"),
  people: () => import("@/modules/people/components/people-module"),
  actors: () => import("@/modules/ensemble/components/actors-module"),
  resources: () => import("./resource-view"),
} as const;

export type LazyModuleId = keyof typeof moduleLoaders;

export const ProductionsModule = dynamic(
  () => import("./modules/productions").then((mod) => mod.ProductionsModule),
  { loading: screenLoading },
);
export const CalendarModule = dynamic(
  () => import("./modules/calendar").then((mod) => mod.CalendarModule),
  { loading: screenLoading },
);
export const TasksModule = dynamic(() => import("./modules/tasks").then((mod) => mod.TasksModule), {
  loading: screenLoading,
});
export const TimeModule = dynamic(() => import("./modules/time").then((mod) => mod.TimeModule), {
  loading: screenLoading,
});
export const ChatModule = dynamic(() => import("./modules/chat").then((mod) => mod.ChatModule), {
  loading: screenLoading,
});
export const SettingsModule = dynamic(
  () => import("./modules/settings").then((mod) => mod.SettingsModule),
  { loading: screenLoading },
);
export const ExportsModule = dynamic(
  () => import("./modules/exports").then((mod) => mod.ExportsModule),
  { loading: screenLoading },
);
export const HelpModule = dynamic(
  () => import("@/modules/help/components/help-module").then((mod) => mod.HelpModule),
  { loading: screenLoading },
);
export const DocumentationModule = dynamic(
  () =>
    import("@/modules/documentation/components/documentation-module").then(
      (mod) => mod.DocumentationModule,
    ),
  { loading: screenLoading },
);
export const PeopleModule = dynamic(
  () => import("@/modules/people/components/people-module").then((mod) => mod.PeopleModule),
  { loading: screenLoading },
);
export const ActorsModule = dynamic(
  () => import("@/modules/ensemble/components/actors-module").then((mod) => mod.ActorsModule),
  { loading: screenLoading },
);
export const MaskPlansModule = dynamic(
  () =>
    import("@/modules/mask-plans/components/mask-plans-module").then((mod) => mod.MaskPlansModule),
  { loading: screenLoading },
);
export const ProductionTeamModule = dynamic(
  () => import("./production-people").then((mod) => mod.ProductionTeamModule),
  { loading: screenLoading },
);
export const RecordDocuments = dynamic(
  () =>
    import("@/modules/documents/components/record-documents").then((mod) => mod.RecordDocuments),
  { loading: screenLoading },
);
export const BackstageChanges = dynamic(
  () =>
    import("@/modules/documentation/components/backstage-changes").then(
      (mod) => mod.BackstageChanges,
    ),
  { loading: screenLoading },
);
export const ResourceView = dynamic(
  () => import("./resource-view").then((mod) => mod.ResourceView),
  { loading: screenLoading },
);
export const RecordDetail = dynamic(
  () => import("./resource-view").then((mod) => mod.RecordDetail),
  { loading: dialogLoading },
);
export const ResourceEditor = dynamic(
  () => import("./resource-editor").then((mod) => mod.ResourceEditor),
  { loading: dialogLoading },
);
export const WorkspaceSearch = dynamic(
  () => import("./workspace-search").then((mod) => mod.WorkspaceSearch),
  { loading: dialogLoading },
);
export const OnboardingTour = dynamic(
  () => import("@/modules/profile/components/onboarding-tour").then((mod) => mod.OnboardingTour),
  { loading: dialogLoading },
);
export const ExportDialog = dynamic(
  () => import("./export-dialog").then((mod) => mod.ExportDialog),
  { loading: dialogLoading },
);
export const ImportDialog = dynamic(
  () => import("./export-dialog").then((mod) => mod.ImportDialog),
  { loading: dialogLoading },
);

/** Warm the chunks behind the given screens without rendering them. */
export function prefetchModules(ids: readonly LazyModuleId[]) {
  for (const id of ids) void moduleLoaders[id]().catch(() => undefined);
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
