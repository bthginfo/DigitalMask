"use client";
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

interface Context {
  workspace: Workspace;
  busy: boolean;
  notice: string;
  online: boolean;
  refresh: () => Promise<void>;
  save: (kind: RecordKind, data: RecordData, record?: DomainRecord) => Promise<DomainRecord>;
  remove: (record: DomainRecord) => Promise<void>;
  action: (action: string, id?: string, data?: RecordData) => Promise<unknown>;
  notify: (message: string) => void;
  mergeMessages: (messages: DomainRecord[]) => void;
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
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const loading = useRef(false);
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const next = await api<Workspace>("/api/workspace");
      setWorkspace(next);
      setError("");
      setPending(false);
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) {
        router.replace("/login");
        return;
      }
      if (e instanceof ApiFailure && e.status === 403) setPending(true);
      else setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen");
    } finally {
      loading.current = false;
    }
  }, [router]);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, [refresh]);
  const mutate = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const result = await run();
      await refresh();
      return result;
    } finally {
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
    )) as DomainRecord;
  };
  const remove = async (record: DomainRecord) => {
    await mutate(() => api(`/api/records/${record.kind}/${record.id}`, { method: "DELETE" }));
  };
  const action = (action: string, id?: string, data?: RecordData) =>
    mutate(() => post("/api/actions", { action, id, data }));
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
        <div className="brand-symbol">M</div>
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
        <div className="brand-symbol">M</div>
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
        refresh,
        save,
        remove,
        action,
        notify: setNotice,
        mergeMessages,
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
