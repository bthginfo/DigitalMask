"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Link2, RefreshCw, Unplug } from "lucide-react";
import { Badge, Button, ErrorMessage } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, ApiFailure, dateLabel, post } from "@/shared/client-api";
import type {
  GoogleCalendarAccount,
  GoogleCalendarDestination,
  GoogleCalendarSelection,
  GoogleCalendarStatus,
} from "../contracts";
import type { GoogleCalendarRun } from "./google-calendar-dialog";
import { googleCalendarEndpoint } from "../contracts";
import { GoogleCalendarSelectionFields } from "./google-calendar-selection-fields";
import styles from "./google-calendar.module.css";

const selectionKey = (scope: GoogleCalendarSelection) =>
  JSON.stringify({
    mode: scope.mode,
    memberIds: scope.mode === "people" ? [...scope.memberIds].sort() : [],
    productionId: scope.productionId || "",
    category: scope.category || "",
  });

export function GoogleCalendarAccountEditor({
  account,
  initialSelection,
  header,
  pending,
  run,
  onStatusChange,
  onNotice,
  onConnect,
  onClose,
}: {
  account: GoogleCalendarAccount;
  initialSelection?: GoogleCalendarSelection;
  header: ReactNode;
  pending: string;
  run: GoogleCalendarRun;
  onStatusChange: (status: GoogleCalendarStatus) => void;
  onNotice: (notice: string) => void;
  onConnect: () => void;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const initial = initialSelection || { mode: "mine" as const, memberIds: [workspace.user.id] };
  const first = account.calendars[0];
  const [editingId, setEditingId] = useState(first?.calendarId || "");
  const [calendarId, setCalendarId] = useState(first?.calendarId || "");
  const [selection, setSelection] = useState(first?.selection || initial);
  const [destinations, setDestinations] = useState<GoogleCalendarDestination[]>([]);
  const [loading, setLoading] = useState(account.status !== "reconnect");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"account" | "calendar" | null>(null);
  const [now, setNow] = useState(Date.now);
  const needsReconnect = account.status === "reconnect";
  const cooling = Boolean(account.retryAfter && new Date(account.retryAfter).getTime() > now);
  const original = account.calendars.find((item) => item.calendarId === editingId);
  const unsaved =
    !original ||
    calendarId !== original.calendarId ||
    selectionKey(selection) !== selectionKey(original.selection);
  const canSave =
    !loading &&
    !pending &&
    !cooling &&
    account.status !== "reconnect" &&
    unsaved &&
    destinations.some((item) => item.id === calendarId) &&
    (selection.mode !== "people" || selection.memberIds.length > 0);
  useEffect(() => {
    if (needsReconnect) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delay = account.retryAfter ? +new Date(account.retryAfter) - Date.now() : 0;
    if (delay > 0) {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          setLoading(true);
          setReload((value) => value + 1);
        },
        Math.min(delay + 100, 2147483647),
      );
    } else {
      void api<{ calendars: GoogleCalendarDestination[] }>(
        `${googleCalendarEndpoint}/calendars?connectionId=${encodeURIComponent(account.id)}`,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setDestinations(result.calendars);
            setError("");
          }
        })
        .catch(async (cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Google-Kalender konnten nicht geladen werden.",
            );
          if (
            !controller.signal.aborted &&
            cause instanceof ApiFailure &&
            [401, 403, 429, 502].includes(cause.status)
          ) {
            try {
              const next = await api<GoogleCalendarStatus>(googleCalendarEndpoint, {
                signal: controller.signal,
              });
              if (!controller.signal.aborted) {
                onStatusChange(next);
                if (next.connections.find((item) => item.id === account.id)?.retryAfter)
                  setError("");
              }
            } catch {
              /* Keep the original provider error. */
            }
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [account.id, needsReconnect, account.retryAfter, reload, onStatusChange]);
  const chooseTarget = (id: string) => {
    const next = account.calendars.find((item) => item.calendarId === id);
    setEditingId(next?.calendarId || "");
    setCalendarId(next?.calendarId || "");
    setSelection(next?.selection || initial);
    setConfirmation(null);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void run("save", async () => {
      const result = await api<GoogleCalendarStatus>(googleCalendarEndpoint, {
        method: "PUT",
        body: JSON.stringify({
          connectionId: account.id,
          calendarId,
          selection,
          ...(editingId ? { previousCalendarId: editingId } : {}),
        }),
      });
      const saved = result.connections
        .find((item) => item.id === account.id)
        ?.calendars.find((item) => item.calendarId === calendarId);
      if (saved) {
        setEditingId(saved.calendarId);
        setSelection(saved.selection);
      }
      onStatusChange(result);
      onNotice(
        "Gespeichert. DigitalMask gleicht deine Kalender im Hintergrund ab. Der erste Abgleich kann einige Minuten dauern.",
      );
    });
  };
  const remove = () =>
    void run("disconnect", async () => {
      const result = await api<GoogleCalendarStatus>(googleCalendarEndpoint, {
        method: "DELETE",
        body: JSON.stringify({
          connectionId: account.id,
          ...(confirmation === "calendar" ? { calendarId: editingId } : {}),
        }),
      });
      if (confirmation === "calendar") {
        const next = result.connections.find((item) => item.id === account.id)?.calendars[0];
        setEditingId(next?.calendarId || "");
        setCalendarId(next?.calendarId || "");
        setSelection(next?.selection || initial);
      }
      setConfirmation(null);
      onStatusChange(result);
      onNotice("Die Verbindung ist getrennt. Bereits übertragene Google-Termine bleiben erhalten.");
    });
  return (
    <>
      <div className={styles.content}>
        {header}
        <div className={styles.account}>
          <strong>DigitalMask → Google Kalender</strong>
          <Badge tone={account.status === "active" && !account.error ? "green" : "neutral"}>
            {account.status === "reconnect"
              ? "Freigabe erneuern"
              : cooling
                ? "Kurze Pause"
                : account.calendars.length
                  ? "Automatisch"
                  : "Ziel auswählen"}
          </Badge>
        </div>
        {account.retryAfter ? (
          <p role="status" className="small muted">
            {cooling
              ? `Google begrenzt gerade Anfragen. Dein Konto bleibt verbunden. Nächster Versuch frühestens ${dateLabel(account.retryAfter, true)}.`
              : "Der Abgleich wird nach der Google-Anfragepause fortgesetzt. Dein Konto bleibt verbunden."}
          </p>
        ) : (
          <ErrorMessage message={account.error || ""} />
        )}
        {account.status === "reconnect" ? (
          <Button variant="primary" disabled={Boolean(pending)} onClick={onConnect}>
            <Link2 size={16} />
            Google-Freigabe erneuern
          </Button>
        ) : (
          <>
            {account.calendars.length > 0 && (
              <label>
                Verbundener Kalender
                <select
                  value={editingId}
                  disabled={Boolean(pending)}
                  onChange={(event) => chooseTarget(event.target.value)}
                >
                  {account.calendars.map((item) => (
                    <option key={item.calendarId} value={item.calendarId}>
                      {item.calendarName}
                    </option>
                  ))}
                  <option value="">+ Weiteren Kalender verbinden</option>
                </select>
              </label>
            )}
            <ErrorMessage message={cooling ? "" : error} />
            {error && (
              <Button
                disabled={loading || Boolean(pending) || cooling}
                onClick={() => {
                  setLoading(true);
                  setNow(Date.now());
                  setReload((value) => value + 1);
                }}
              >
                Kalender neu laden
              </Button>
            )}
            <form id="google-calendar-settings" onSubmit={save} className={styles.form}>
              <label>
                Zielkalender
                <select
                  required
                  value={calendarId}
                  disabled={Boolean(pending) || loading || !destinations.length || cooling}
                  onChange={(event) => setCalendarId(event.target.value)}
                >
                  <option value="">Eigenen Google-Kalender auswählen</option>
                  {destinations
                    .filter(
                      (item) =>
                        item.id === editingId ||
                        !account.calendars.some((target) => target.calendarId === item.id),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.primary ? " (Hauptkalender)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {loading && !cooling && (
                <p role="status" className="small muted">
                  Eigene Kalender werden geladen …
                </p>
              )}
              {!loading && !error && !cooling && !destinations.length && (
                <p className="small muted">
                  Keine eigenen Kalender gefunden. Bitte prüfe deine Kalender in Google.
                </p>
              )}
              <GoogleCalendarSelectionFields
                selection={selection}
                onChange={setSelection}
                disabled={Boolean(pending)}
                initialSelection={initialSelection}
              />
              <p className="small muted">
                Die Auswahl gilt nur für diesen Zielkalender, unabhängig vom angezeigten Monat und
                der Spielzeit. Änderungen bitte in DigitalMask vornehmen; Google-Änderungen werden
                nicht zurückübertragen.{" "}
                <a href="/google-calendar" target="_blank" rel="noreferrer">
                  Datennutzung
                </a>
              </p>
              {account.lastSyncedAt && (
                <p className="small muted">
                  Letzter vollständiger Abgleich dieses Kontos:{" "}
                  {dateLabel(account.lastSyncedAt, true)}
                </p>
              )}
              {account.status === "active" && (
                <Button
                  disabled={Boolean(pending) || unsaved || cooling}
                  onClick={() =>
                    void run("sync", async () => {
                      await post(`${googleCalendarEndpoint}/sync`, { connectionId: account.id });
                      onNotice(
                        "Der Abgleich läuft im Hintergrund. Wiederholtes Verbinden ist dafür nicht nötig.",
                      );
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Jetzt abgleichen
                </Button>
              )}
            </form>
          </>
        )}
        <div className={styles.disconnect}>
          {confirmation ? (
            <>
              <p>
                {confirmation === "calendar"
                  ? "Diesen Kalender trennen? Die anderen Kalender und das Google-Konto bleiben verbunden."
                  : "Dieses Google-Konto und alle seine Zielkalender trennen? Andere Google-Konten bleiben verbunden."}{" "}
                Bereits übertragene Termine bleiben in Google erhalten. Bei einer späteren neuen
                Verbindung können zusätzliche Kopien entstehen.
              </p>
              <div className={styles.actions}>
                <Button variant="danger-ghost" disabled={Boolean(pending)} onClick={remove}>
                  Verbindung jetzt trennen
                </Button>
                <Button disabled={Boolean(pending)} onClick={() => setConfirmation(null)}>
                  Abbrechen
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="danger-ghost"
                disabled={Boolean(pending)}
                onClick={() => setConfirmation("account")}
              >
                <Unplug size={15} />
                Google-Konto trennen
              </Button>
              {original && (
                <Button
                  variant="danger-ghost"
                  disabled={Boolean(pending)}
                  onClick={() => setConfirmation("calendar")}
                >
                  Diesen Kalender trennen
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <footer className="dialog-footer">
        <Button disabled={Boolean(pending)} onClick={onClose}>
          Schließen
        </Button>
        {account.status !== "reconnect" && (
          <button
            type="submit"
            form="google-calendar-settings"
            className="button primary"
            disabled={!canSave}
          >
            {pending === "save"
              ? "Wird gespeichert …"
              : original
                ? "Auswahl speichern"
                : account.calendars.length
                  ? "Kalender hinzufügen"
                  : "Abgleich aktivieren"}
          </button>
        )}
      </footer>
    </>
  );
}
