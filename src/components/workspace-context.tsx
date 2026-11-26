"use client";
import { BrandMark } from "./brand-mark";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  recordKinds,
  type DomainRecord,
  type RecordData,
  type RecordKind,
  type Workspace,
} from "@/shared/contracts";
import { api, ApiFailure, post } from "@/shared/client-api";
import { subscribeConnectivity } from "@/shared/client-storage";
import { useRouter } from "next/navigation";
import { connectLiveSync, type SyncStatus } from "@/shared/live-sync";
import { syncAppBadge } from "@/modules/notifications/client";
import { safeNotificationLink } from "@/modules/notifications/links";
import {
  mergeWorkspaceUpdate,
  partialWorkspaceKinds,
  recordChangeKinds,
  withoutRecords,
  type WorkspacePatch,
} from "@/shared/workspace-sync";
import { clientId } from "@/shared/client-id";
import { navigateWorkspace } from "@/shared/client-navigation";

export interface WorkspaceStatus {
  busy: boolean;
  notice: string;
  online: boolean;
  syncStatus: SyncStatus;
}
/** Stable for the lifetime of the provider; safe as effect and memo dependencies. */
export interface WorkspaceActions {
  refresh: () => Promise<void>;
  /** Reload only the given record kinds (a full snapshot when omitted or visibility changes). */
  reload: (kinds?: readonly RecordKind[]) => Promise<void>;
  save: (kind: RecordKind, data: RecordData, record?: DomainRecord) => Promise<DomainRecord>;
  remove: (record: DomainRecord) => Promise<void>;
  action: (action: string, id?: string, data?: RecordData) => Promise<unknown>;
  notify: (message: string) => void;
  mergeMessages: (messages: DomainRecord[]) => void;
  removeFile: (file: DomainRecord) => Promise<void>;
  runWorkflow: <T = unknown>(
    url: string,
    data: RecordData,
    kinds?: readonly RecordKind[],
  ) => Promise<T>;
}
interface Context extends WorkspaceStatus, WorkspaceActions {
  workspace: Workspace;
}
const WorkspaceDataContext = createContext<Workspace | null>(null);
const WorkspaceStatusContext = createContext<WorkspaceStatus | null>(null);
const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null);
const missing = (): never => {
  throw new Error("Workspace fehlt");
};
/** Workspace records only; does not re-render for busy, notices or connection changes. */
export const useWorkspaceData = () => useContext(WorkspaceDataContext) ?? missing();
export const useWorkspaceStatus = () => useContext(WorkspaceStatusContext) ?? missing();
export const useWorkspaceActions = () => useContext(WorkspaceActionsContext) ?? missing();
/** Combined view for existing consumers; prefer the narrow hooks in frequently rendered views. */
export const useWorkspace = (): Context => {
  const workspace = useWorkspaceData();
  const status = useWorkspaceStatus();
  const actions = useWorkspaceActions();
  return useMemo(() => ({ workspace, ...status, ...actions }), [workspace, status, actions]);
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [liveAttempt, setLiveAttempt] = useState(0);
  const liveAccess = useRef<Workspace["live"]>(null);
  const statusRef = useRef<SyncStatus>("connecting");
  const mutationPending = useRef(false);
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const loading = useRef<Promise<void> | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const queued = useRef({
    full: false,
    kinds: new Set<RecordKind>(),
    settled: [] as (() => void)[],
  });
  const reload = useCallback(
    async (kinds?: readonly RecordKind[], settled?: () => void) => {
      const selected = workspaceRef.current ? partialWorkspaceKinds(kinds) : undefined;
      if (!selected) queued.current.full = true;
      else for (const kind of selected) queued.current.kinds.add(kind);
      if (settled) {
        if (queued.current.full || queued.current.kinds.size) queued.current.settled.push(settled);
        else settled();
      }
      if (loading.current) return loading.current;
      const run = async () => {
        while (queued.current.full || queued.current.kinds.size) {
          const selected = queued.current.full ? undefined : [...queued.current.kinds];
          const done = queued.current.settled.splice(0);
          queued.current.full = false;
          queued.current.kinds.clear();
          try {
            const query = selected ? `?${new URLSearchParams({ kinds: selected.join(",") })}` : "";
            const update = await api<Workspace | WorkspacePatch>(`/api/workspace${query}`);
            const next = mergeWorkspaceUpdate(workspaceRef.current, update);
            workspaceRef.current = next;
            liveAccess.current = next.live;
            setWorkspace(next);
            if (statusRef.current === "unavailable" && next.live)
              setLiveAttempt((attempt) => attempt + 1);
            setError("");
            setPending(false);
          } catch (e) {
            if (e instanceof ApiFailure && e.status === 401) {
              const next = safeNotificationLink(location.pathname + location.search);
              router.replace(next === "/" ? "/login" : `/login?${new URLSearchParams({ next })}`);
              return;
            }
            if (e instanceof ApiFailure && e.status === 403) setPending(true);
            else setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen");
          } finally {
            // Mutations end in the same commit as their data, instead of one render each.
            for (const callback of done) callback();
          }
        }
      };
      loading.current = run().finally(() => {
        loading.current = null;
        for (const callback of queued.current.settled.splice(0)) callback();
      });
      return loading.current;
    },
    [router],
  );
  const refresh = useCallback(() => reload(), [reload]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void refresh();
      if ("serviceWorker" in navigator)
        void navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .catch(() => undefined);
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    // Notification taps in an already open app arrive from the service worker.
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const navigate = (event: MessageEvent) => {
      if (event.data?.type !== "DIGITALMASK_NAVIGATE" || typeof event.data.url !== "string") return;
      try {
        const target = new URL(event.data.url, location.href);
        if (target.origin !== location.origin) return;
        navigateWorkspace(safeNotificationLink(target.pathname + target.search));
      } catch {
        /* Ignore malformed messages. */
      }
    };
    container.addEventListener("message", navigate);
    container.startMessages?.();
    return () => container.removeEventListener("message", navigate);
  }, []);
  /** Fresh live ticket without reloading workspace data; `true` when data was reloaded. */
  const renewLive = useCallback(async () => {
    try {
      liveAccess.current = await api<Workspace["live"]>("/api/realtime/ticket");
      return false;
    } catch (e) {
      // Signed out, pending access or an older server: the full snapshot handles all three.
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        await reload();
        return true;
      }
      throw e;
    }
  }, [reload]);
  const liveEnabled = Boolean(workspace?.live);
  const departmentId = workspace?.department.id;
  const userId = workspace?.user.id;
  const unreadCount =
    workspace?.records.notifications.filter(
      (notice) => notice.data.userId === userId && !notice.data.read,
    ).length || 0;
  useEffect(() => {
    if (userId) void syncAppBadge(userId, unreadCount).catch(() => undefined);
  }, [userId, unreadCount]);
  useEffect(() => {
    if (!userId) return;
    const report = (status: SyncStatus) => {
      statusRef.current = status;
      setSyncStatus(status);
    };
    if (!liveEnabled) {
      report(navigator.onLine ? "unavailable" : "offline");
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let full = false;
    const pendingKinds = new Set<RecordKind>();
    const changed = (kinds?: readonly RecordKind[]) => {
      if (!kinds) full = true;
      else for (const kind of kinds) pendingKinds.add(kind);
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          if (disposed) return;
          if (mutationPending.current) {
            changed(full ? undefined : [...pendingKinds]);
            return;
          }
          const selected = full ? undefined : [...pendingKinds];
          full = false;
          pendingKinds.clear();
          void reload(selected);
          // Jitter spreads the refetch of many open devices after one shared change.
        },
        450 + Math.random() * 1500,
      );
    };
    const disconnect = connectLiveSync({
      access: () => liveAccess.current,
      renew: renewLive,
      changed,
      status: report,
      origin: clientId(),
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      disconnect();
    };
  }, [liveEnabled, departmentId, userId, liveAttempt, renewLive, reload]);
  const mutations = useRef(0);
  const mutate = useCallback(
    async <T,>(
      run: () => Promise<T>,
      kinds?: readonly RecordKind[],
      local?: (workspace: Workspace) => Workspace,
    ): Promise<T> => {
      mutations.current++;
      mutationPending.current = true;
      setBusy(true);
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        mutations.current = Math.max(0, mutations.current - 1);
        if (mutations.current) return;
        mutationPending.current = false;
        setBusy(false);
      };
      try {
        const result = await run();
        const current = workspaceRef.current;
        const next = current && local ? local(current) : current;
        if (next && next !== current) {
          workspaceRef.current = next;
          setWorkspace(next);
        }
        await reload(kinds, end);
        return result;
      } finally {
        end();
      }
    },
    [reload],
  );
  const save = useCallback(
    (kind: RecordKind, data: RecordData, record?: DomainRecord) =>
      mutate(
        () =>
          record
            ? api<DomainRecord>(`/api/records/${kind}/${record.id}`, {
                method: "PATCH",
                body: JSON.stringify({ data, version: record.version }),
              })
            : post<DomainRecord>(`/api/records/${kind}`, { data }),
        recordChangeKinds(kind),
      ),
    [mutate],
  );
  const remove = useCallback(
    async (record: DomainRecord) => {
      // The server deletes a record together with the files attached to it; drop both locally
      // and reload only the affected kinds instead of the whole workspace.
      await mutate(
        () =>
          api(
            `/api/records/${record.kind}/${record.id}?${new URLSearchParams({ version: String(record.version) })}`,
            { method: "DELETE" },
          ),
        recordChangeKinds(record.kind),
        (current) =>
          withoutRecords(
            current,
            new Set([
              record.id,
              ...current.records.files
                .filter((file) => file.data.recordId === record.id)
                .map((file) => file.id),
            ]),
          ),
      );
    },
    [mutate],
  );
  const action = useCallback(
    (action: string, id?: string, data?: RecordData) =>
      mutate(
        () => post("/api/actions", { action, id, data }),
        ["notifications-read", "chat-notifications-read", "notification-read"].includes(action)
          ? ["notifications"]
          : action.startsWith("attendance-timer-")
            ? ["attendance"]
            : action.startsWith("timer-")
              ? ["time"]
              : action === "leave-decide"
                ? ["events", "leave"]
                : undefined,
      ),
    [mutate],
  );
  const runWorkflow = useCallback(
    <T = unknown,>(url: string, data: RecordData, kinds?: readonly RecordKind[]) =>
      mutate(() => post<T>(url, data), kinds),
    [mutate],
  );
  const removeFile = useCallback(
    async (file: DomainRecord) => {
      const owner = recordKinds.find((kind) => kind === file.data.recordKind);
      await mutate(
        () => api(`/api/files/${file.id}`, { method: "DELETE" }),
        // The owning record's attachment list changes with the file; nothing else does.
        owner ? recordChangeKinds(owner) : undefined,
        (current) => withoutRecords(current, new Set([file.id])),
      );
    },
    [mutate],
  );
  const mergeMessages = useCallback((messages: DomainRecord[]) => {
    const current = workspaceRef.current;
    if (!current) return;
    const incoming = new Set(messages.map((message) => message.id));
    const next = {
      ...current,
      records: {
        ...current.records,
        messages: [
          ...current.records.messages.filter((message) => !incoming.has(message.id)),
          ...messages,
        ],
      },
    };
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  const actions = useMemo<WorkspaceActions>(
    () => ({
      refresh,
      reload: (kinds?: readonly RecordKind[]) => reload(kinds),
      save,
      remove,
      action,
      notify: setNotice,
      mergeMessages,
      removeFile,
      runWorkflow,
    }),
    [refresh, reload, save, remove, action, mergeMessages, removeFile, runWorkflow],
  );
  const status = useMemo<WorkspaceStatus>(
    () => ({ busy, notice, online, syncStatus }),
    [busy, notice, online, syncStatus],
  );
  if (pending)
    return (
      <main className="gate">
        <BrandMark />
        <h1>Dein Zugang wartet auf Freigabe.</h1>
        <p>
          Ein Admin der Maske prüft deine Registrierung. Sobald dein Zugang aktiv ist, kannst du
          hier starten.
        </p>
        <button className="button primary" onClick={() => void refresh()}>
          Freigabe prüfen
        </button>
        <button
          className="button ghost"
          onClick={async () => {
            await post("/api/logout", {});
            router.replace("/login");
          }}
        >
          Abmelden
        </button>
      </main>
    );
  if (!workspace)
    return (
      <main className="gate">
        <BrandMark />
        <h1>{error ? "Verbindung unterbrochen" : "Deine Maske wird vorbereitet …"}</h1>
        <p>{error || "Produktionen, Aufgaben und Termine werden geladen."}</p>
        {error ? (
          <button className="button primary" onClick={() => void refresh()}>
            Erneut versuchen
          </button>
        ) : (
          <div className="loading-bar" />
        )}
      </main>
    );
  return (
    <WorkspaceActionsContext.Provider value={actions}>
      <WorkspaceStatusContext.Provider value={status}>
        <WorkspaceDataContext.Provider value={workspace}>
          {error && (
            <div className="connectivity-banner" role="alert">
              Die Übersicht konnte nicht aktualisiert werden: {error}. Deine zuletzt geladenen Daten
              bleiben sichtbar.
              <button className="text-button" onClick={() => void refresh()}>
                Erneut laden
              </button>
            </div>
          )}
          {children}
        </WorkspaceDataContext.Provider>
      </WorkspaceStatusContext.Provider>
    </WorkspaceActionsContext.Provider>
  );
}
