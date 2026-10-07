"use client";
import { BrandMark } from "./brand-mark";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { DomainRecord, RecordData, RecordKind, Workspace } from "@/shared/contracts";
import { api, ApiFailure, post } from "@/shared/client-api";
import { subscribeConnectivity } from "@/shared/client-storage";
import { useRouter } from "next/navigation";
import { connectLiveSync, type SyncStatus } from "@/shared/live-sync";
import { syncAppBadge } from "@/modules/notifications/client";
import { changeSignal, useChangeFeed, useUndoReceipts } from "@/modules/changes/client";
import type { MutationRecord, UndoReceipt } from "@/modules/changes/contracts";

interface Context {
  workspace: Workspace;
  busy: boolean;
  notice: string;
  online: boolean;
  syncStatus: SyncStatus;
  refresh: () => Promise<void>;
  save: (kind: RecordKind, data: RecordData, record?: DomainRecord) => Promise<DomainRecord>;
  remove: (record: DomainRecord) => Promise<void>;
  action: (action: string, id?: string, data?: RecordData) => Promise<unknown>;
  notify: (message: string) => void;
  mergeMessages: (messages: DomainRecord[]) => void;
  changes: ReturnType<typeof useChangeFeed>;
  changesScope: { productionId: string; recordId: string } | null;
  openChanges: (productionId?: string, recordId?: string) => void;
  closeChanges: () => void;
  undoReceipts: UndoReceipt[];
  undoOperation: (id: string) => Promise<void>;
  dismissUndo: (id: string) => void;
  captureUndo: (result: unknown) => void;
  removeFile: (file: DomainRecord) => Promise<void>;
  runWorkflow: <T = unknown>(url: string, data: RecordData) => Promise<T>;
}
const WorkspaceContext = createContext<Context | null>(null);
export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace fehlt");
  return context;
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [changesScope, setChangesScope] = useState<{
    productionId: string;
    recordId: string;
  } | null>(null);
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
  const reloadAgain = useRef(false);
  const refresh = useCallback(async () => {
    if (loading.current) {
      reloadAgain.current = true;
      return loading.current;
    }
    const run = async () => {
      do {
        reloadAgain.current = false;
        try {
          const next = await api<Workspace>("/api/workspace");
          liveAccess.current = next.live;
          setWorkspace(next);
          if (statusRef.current === "unavailable" && next.live)
            setLiveAttempt((attempt) => attempt + 1);
          setError("");
          setPending(false);
        } catch (e) {
          if (e instanceof ApiFailure && e.status === 401) {
            router.replace("/login");
            return;
          }
          if (e instanceof ApiFailure && e.status === 403) setPending(true);
          else setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen");
        }
      } while (reloadAgain.current);
    };
    loading.current = run().finally(() => {
      loading.current = null;
    });
    return loading.current;
  }, [router]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => undefined);
  }, [refresh]);
  const liveEnabled = Boolean(workspace?.live);
  const departmentId = workspace?.department.id;
  const userId = workspace?.user.id;
  const changes = useChangeFeed(userId);
  const undo = useUndoReceipts(userId);
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
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed) return;
        if (mutationPending.current) {
          changed();
          return;
        }
        void refresh().then(() => window.dispatchEvent(new Event(changeSignal)));
      }, 450);
    };
    const disconnect = connectLiveSync({
      access: () => liveAccess.current,
      renew: refresh,
      changed,
      status: report,
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      disconnect();
    };
  }, [liveEnabled, departmentId, userId, liveAttempt, refresh]);
  const mutate = async (run: () => Promise<unknown>) => {
    mutationPending.current = true;
    setBusy(true);
    try {
      const result = await run();
      undo.capture(result);
      await refresh();
      window.dispatchEvent(new Event(changeSignal));
      return result;
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  };
  const save = async (kind: RecordKind, data: RecordData, record?: DomainRecord) => {
    return (await mutate(() =>
      record
        ? api(`/api/records/${kind}/${record.id}`, {
            method: "PATCH",
            body: JSON.stringify({ data, version: record.version }),
          })
        : post(`/api/records/${kind}`, { data }),
    )) as MutationRecord;
  };
  const remove = async (record: DomainRecord) => {
    await mutate(() =>
      api(
        `/api/records/${record.kind}/${record.id}?${new URLSearchParams({ version: String(record.version) })}`,
        { method: "DELETE" },
      ),
    );
  };
  const action = (action: string, id?: string, data?: RecordData) =>
    mutate(() => post("/api/actions", { action, id, data }));
  const runWorkflow = async <T = unknown,>(url: string, data: RecordData) =>
    (await mutate(() => post<T>(url, data))) as T;
  const removeFile = async (file: DomainRecord) => {
    await mutate(() => api(`/api/files/${file.id}`, { method: "DELETE" }));
  };
  const undoOperation = async (id: string) => {
    await mutate(() => post("/api/undo", { operationId: id }));
    undo.dismiss(id);
    setNotice("Die Änderung wurde rückgängig gemacht.");
  };
  const mergeMessages = (messages: DomainRecord[]) =>
    setWorkspace((current) =>
      current
        ? {
            ...current,
            records: {
              ...current.records,
              messages: [
                ...current.records.messages.filter((x) => !messages.some((m) => m.id === x.id)),
                ...messages,
              ],
            },
          }
        : current,
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
    <WorkspaceContext.Provider
      value={{
        workspace,
        busy,
        notice,
        online,
        syncStatus,
        refresh,
        save,
        remove,
        action,
        notify: setNotice,
        mergeMessages,
        changes,
        changesScope,
        openChanges: (productionId = "", recordId = "") =>
          setChangesScope({ productionId, recordId }),
        closeChanges: () => setChangesScope(null),
        undoReceipts: undo.receipts,
        undoOperation,
        dismissUndo: undo.dismiss,
        captureUndo: undo.capture,
        removeFile,
        runWorkflow,
      }}
    >
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
    </WorkspaceContext.Provider>
  );
}
