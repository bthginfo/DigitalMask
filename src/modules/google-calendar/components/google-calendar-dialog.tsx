"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Link2, RefreshCw, Unplug } from "lucide-react";
import { Badge, Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, dateLabel, post } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { sortCalendarStaff } from "@/shared/calendar-team";
import { calendarProductionRecords } from "@/shared/calendar-access";
import { calendarCategories } from "@/modules/calendar/components/client-calendar";
import {
  googleCalendarMessages,
  type GoogleCalendarDestination,
  type GoogleCalendarSelection,
  type GoogleCalendarStatus,
} from "../contracts";
import styles from "./google-calendar.module.css";

const endpoint = "/api/integrations/google-calendar";
export const returnedFromGoogleCalendar = () =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("googleCalendar");

export function GoogleCalendarDialog({
  initialSelection,
  returnTo,
  onClose,
}: {
  initialSelection?: GoogleCalendarSelection;
  returnTo: "calendar" | "settings";
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [destinations, setDestinations] = useState<GoogleCalendarDestination[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [selection, setSelection] = useState<GoogleCalendarSelection>(
    () => initialSelection || { mode: "mine", memberIds: [workspace.user.id] },
  );
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() =>
    typeof window === "undefined"
      ? ""
      : googleCalendarMessages[
          new URLSearchParams(window.location.search).get("googleCalendar") || ""
        ] || "",
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const staff = sortCalendarStaff(workspace.members.filter(isActiveStaff));
  const productions = calendarProductionRecords(workspace);
  const categories = calendarCategories(workspace);
  const connection = status?.connection;
  const selectionKey = (scope: GoogleCalendarSelection) =>
    JSON.stringify({
      mode: scope.mode,
      memberIds: scope.mode === "people" ? [...scope.memberIds].sort() : [],
      productionId: scope.productionId || "",
      category: scope.category || "",
    });
  const unsaved = Boolean(
    connection &&
    (calendarId !== connection.calendarId ||
      selectionKey(selection) !== selectionKey(connection.selection)),
  );
  const canSave = Boolean(
    connection &&
    connection.status !== "reconnect" &&
    !loading &&
    !pending &&
    destinations.some((item) => item.id === calendarId) &&
    (selection.mode !== "people" || selection.memberIds.length) &&
    (connection.status !== "active" || unsaved),
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("googleCalendar")) {
      url.searchParams.delete("googleCalendar");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const next = await api<GoogleCalendarStatus>(endpoint, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStatus(next);
        if (!next.connection) return;
        setCalendarId(next.connection.calendarId || "");
        if (next.connection.status !== "connected") setSelection(next.connection.selection);
        if (next.connection.status === "reconnect") return;
        const result = await api<{ calendars: GoogleCalendarDestination[] }>(
          `${endpoint}/calendars`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setDestinations(result.calendars);
      } catch (exception) {
        if (!controller.signal.aborted)
          setError(
            exception instanceof Error
              ? exception.message
              : "Google-Kalender konnten nicht geladen werden.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [reload]);

  const run = async (operation: string, action: () => Promise<void>) => {
    setPending(operation);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Die Google-Verbindung konnte nicht geändert werden.",
      );
    } finally {
      setPending("");
    }
  };
  const connect = () =>
    void run("connect", async () => {
      const result = await post<{ url: string }>(`${endpoint}/connect`, { returnTo });
      window.location.assign(result.url);
    });
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void run("save", async () => {
      const result = await api<GoogleCalendarStatus>(endpoint, {
        method: "PUT",
        body: JSON.stringify({ calendarId, selection }),
      });
      setStatus(result);
      if (result.connection) setSelection(result.connection.selection);
      setNotice("Gespeichert. Die Termine werden im Hintergrund mit Google abgeglichen.");
    });
  };
  return (
    <Modal
      title="Google Kalender verbinden"
      className={styles.dialog}
      onClose={pending ? () => {} : onClose}
    >
      <div className={styles.content}>
        <p>
          Deine DigitalMask-Termine erscheinen direkt in einem bestehenden Google-Kalender.
          Änderungen in DigitalMask werden automatisch übertragen.
        </p>
        {notice && (
          <p role="status" className="success-message">
            <Check size={16} />
            {notice}
          </p>
        )}
        <ErrorMessage message={error || connection?.error || ""} />
        {!status && loading && (
          <p role="status" className="muted">
            Verbindung wird geladen …
          </p>
        )}
        {error && (
          <Button
            disabled={Boolean(pending) || loading}
            onClick={() => {
              setError("");
              setLoading(true);
              setReload((value) => value + 1);
            }}
          >
            Verbindung neu laden
          </Button>
        )}
        {status?.configured === false && (
          <p className="muted">
            Die Google-Anbindung wird noch eingerichtet. Du kannst bis dahin den Kalenderlink unter
            Einstellungen verwenden.
          </p>
        )}
        {status?.configured && !connection && (
          <>
            <div className={styles.disclosure}>
              <strong>Du bestimmst, was übertragen wird.</strong>
              <p>
                Nach der Google-Freigabe wählst du einen eigenen Zielkalender und die Personen aus.
                Google fragt nach deiner Kontoidentität, deiner Kalenderliste und Terminrechten für
                deine eigenen Kalender. DigitalMask bearbeitet dort ausschließlich selbst angelegte
                Einträge.
              </p>
              <a href="/google-calendar" target="_blank" rel="noreferrer">
                Hinweise zur Google-Verbindung und Datennutzung
              </a>
            </div>
            <Button variant="primary" onClick={connect} disabled={Boolean(pending)}>
              <Link2 size={16} />
              {pending === "connect" ? "Google wird geöffnet …" : "Mit Google Kalender verbinden"}
            </Button>
          </>
        )}
        {connection && (
          <>
            <div className={styles.account}>
              <div>
                <strong>{connection.email}</strong>
                <span className="small muted">
                  {connection.status === "active"
                    ? "DigitalMask → Google Kalender"
                    : "Google-Konto verbunden"}
                </span>
              </div>
              <Badge
                tone={connection.status === "active" && !connection.error ? "green" : "neutral"}
              >
                {connection.status === "reconnect"
                  ? "Erneut verbinden"
                  : connection.calendarId
                    ? "Automatisch"
                    : "Ziel auswählen"}
              </Badge>
            </div>
            {connection.status === "reconnect" ? (
              <Button variant="primary" disabled={Boolean(pending)} onClick={connect}>
                <Link2 size={16} />
                Google erneut verbinden
              </Button>
            ) : (
              <form id="google-calendar-settings" onSubmit={save} className={styles.form}>
                <label>
                  Zielkalender
                  <select
                    value={calendarId}
                    onChange={(event) => setCalendarId(event.target.value)}
                    required
                    disabled={Boolean(pending) || !destinations.length}
                  >
                    <option value="">Eigenen Google-Kalender auswählen</option>
                    {destinations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.primary ? " (Hauptkalender)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!destinations.length && !error && (
                  <p role="status" className="small muted">
                    {loading
                      ? "Eigene Kalender werden geladen …"
                      : "Keine eigenen Kalender gefunden. Bitte prüfe deine Kalender in Google."}
                  </p>
                )}
                <fieldset className={styles.people} disabled={Boolean(pending)}>
                  <legend>Wessen Termine?</legend>
                  <div className={styles.modes}>
                    {(
                      [
                        ["mine", "Nur ich"],
                        ["people", "Personen auswählen"],
                        ["team", "Ganzes Team"],
                      ] as const
                    ).map(([mode, label]) => (
                      <label key={mode}>
                        <input
                          type="radio"
                          name="google-calendar-scope"
                          value={mode}
                          checked={selection.mode === mode}
                          onChange={() => setSelection({ ...selection, mode })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {selection.mode === "people" && (
                    <div className={styles.members}>
                      {staff.map((member) => (
                        <label key={member.id}>
                          <input
                            type="checkbox"
                            checked={selection.memberIds.includes(member.id)}
                            onChange={(event) =>
                              setSelection({
                                ...selection,
                                memberIds: event.target.checked
                                  ? [...selection.memberIds, member.id]
                                  : selection.memberIds.filter((id) => id !== member.id),
                              })
                            }
                          />
                          {member.name}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                <details
                  className={styles.filters}
                  open={Boolean(selection.productionId || selection.category) || undefined}
                >
                  <summary>Produktion oder Kalenderart eingrenzen</summary>
                  <div className={styles.filterFields}>
                    <label>
                      Produktion
                      <select
                        value={selection.productionId || ""}
                        onChange={(event) =>
                          setSelection({ ...selection, productionId: event.target.value })
                        }
                        disabled={Boolean(pending)}
                      >
                        <option value="">Alle Produktionen</option>
                        {productions.map((row) => (
                          <option key={row.id} value={row.id}>
                            {String(row.data.title)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Kalenderart
                      <select
                        value={selection.category || ""}
                        onChange={(event) =>
                          setSelection({ ...selection, category: event.target.value })
                        }
                        disabled={Boolean(pending)}
                      >
                        <option value="">Alle Kalenderarten</option>
                        {categories.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </details>
                {initialSelection && (
                  <Button
                    disabled={Boolean(pending)}
                    onClick={() => setSelection(initialSelection)}
                  >
                    <CalendarDays size={16} />
                    Aktuelle Kalenderauswahl übernehmen
                  </Button>
                )}
                <p className="small muted">
                  Der Abgleich läuft unabhängig vom gerade angezeigten Monat und der Spielzeit. Bei
                  einer neuen Auswahl oder einem neuen Ziel werden bisher übertragene
                  DigitalMask-Termine entsprechend entfernt. Andere Google-Termine bleiben erhalten.
                </p>
                <p className="small muted">
                  Die Termine werden in Google als privat angelegt. Ihre Bearbeitung erfolgt in
                  DigitalMask; Google-Änderungen werden nicht zurückübertragen.{" "}
                  <a href="/google-calendar" target="_blank" rel="noreferrer">
                    Datennutzung
                  </a>
                </p>
                {connection.lastSyncedAt && (
                  <p className="small muted">
                    Letzter vollständiger Abgleich: {dateLabel(connection.lastSyncedAt, true)}
                  </p>
                )}
                <div className={styles.actions}>
                  {connection.status === "active" && (
                    <Button
                      disabled={Boolean(pending) || unsaved}
                      onClick={() =>
                        void run("sync", async () => {
                          await post(`${endpoint}/sync`, {});
                          setNotice("Der Abgleich wurde angefordert und läuft im Hintergrund.");
                        })
                      }
                    >
                      <RefreshCw size={15} />
                      Jetzt abgleichen
                    </Button>
                  )}
                </div>
              </form>
            )}
            <div className={styles.disconnect}>
              {disconnecting ? (
                <>
                  <p>
                    Verbindung trennen? Der automatische Abgleich endet. Bereits übertragene Termine
                    bleiben in Google erhalten; die gespeicherten Google-Zugänge werden aus
                    DigitalMask gelöscht.
                  </p>
                  <div className={styles.actions}>
                    <Button
                      variant="danger-ghost"
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void run("disconnect", async () => {
                          const result = await api<GoogleCalendarStatus>(endpoint, {
                            method: "DELETE",
                            body: "{}",
                          });
                          setStatus(result);
                          setDisconnecting(false);
                          setDestinations([]);
                          setNotice("Die Google-Verbindung ist getrennt.");
                        })
                      }
                    >
                      Verbindung jetzt trennen
                    </Button>
                    <Button disabled={Boolean(pending)} onClick={() => setDisconnecting(false)}>
                      Abbrechen
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="danger-ghost"
                  disabled={Boolean(pending)}
                  onClick={() => setDisconnecting(true)}
                >
                  <Unplug size={15} />
                  Verbindung trennen
                </Button>
              )}
              {connection.status !== "reconnect" && (
                <Button disabled={Boolean(pending)} onClick={connect}>
                  Google erneut verbinden
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <Button onClick={onClose} disabled={Boolean(pending)}>
          Schließen
        </Button>
        {connection && connection.status !== "reconnect" && (
          <button
            type="submit"
            form="google-calendar-settings"
            className="button primary"
            disabled={!canSave}
          >
            {pending === "save"
              ? "Wird gespeichert …"
              : connection.calendarId
                ? "Auswahl speichern"
                : "Abgleich aktivieren"}
          </button>
        )}
      </footer>
    </Modal>
  );
}
