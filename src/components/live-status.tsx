"use client";
import { useWorkspace } from "./workspace-context";

const labels = {
  connecting: "Verbindung wird aufgebaut",
  live: "Live verbunden",
  reconnecting: "Verbindung wird erneuert",
  offline: "Offline",
  paused: "Aktualisierung pausiert",
  unavailable: "Live-Verbindung unterbrochen",
};
const descriptions = {
  connecting: "Die automatische Aktualisierung wird gestartet.",
  live: "Änderungen im Team werden automatisch angezeigt.",
  reconnecting: "Wir verbinden dich automatisch neu. Deine Eingaben bleiben erhalten.",
  offline: "Sobald du wieder online bist, werden Änderungen automatisch geladen.",
  paused: "Im Hintergrund pausiert die Aktualisierung. Beim Zurückkehren wird sie fortgesetzt.",
  unavailable: "Die automatische Aktualisierung ist gerade nicht verfügbar.",
};

export function LiveStatus({ recovery = false }: { recovery?: boolean }) {
  const { syncStatus, refresh, busy, online } = useWorkspace();
  return (
    <div className={`live-status is-${syncStatus}`}>
      <span role="status" title={descriptions[syncStatus]}>
        <i aria-hidden="true" />
        {labels[syncStatus]}
      </span>
      {recovery && syncStatus === "unavailable" && (
        <button className="text-button" disabled={busy || !online} onClick={() => void refresh()}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
