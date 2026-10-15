"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Link2, Plus } from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { api, post } from "@/shared/client-api";
import {
  googleCalendarMessages,
  googleCalendarEndpoint,
  type GoogleCalendarSelection,
  type GoogleCalendarStatus,
} from "../contracts";
import { GoogleCalendarAccountEditor } from "./google-calendar-account-editor";
import styles from "./google-calendar.module.css";

export const returnedFromGoogleCalendar = () =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("googleCalendar");
export type GoogleCalendarRun = (operation: string, action: () => Promise<void>) => Promise<void>;

export function GoogleCalendarDialog({
  initialSelection,
  returnTo,
  onClose,
}: {
  initialSelection?: GoogleCalendarSelection;
  returnTo: "calendar" | "settings";
  onClose: () => void;
}) {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [selectedId, setSelectedId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("googleConnection") || "",
  );
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() =>
    typeof window === "undefined"
      ? ""
      : googleCalendarMessages[
          new URLSearchParams(window.location.search).get("googleCalendar") || ""
        ] || "",
  );
  const account =
    status?.connections.find((item) => item.id === selectedId) || status?.connections[0];
  const updateStatus = useCallback((next: GoogleCalendarStatus) => {
    setStatus(next);
    setSelectedId((current) =>
      next.connections.some((item) => item.id === current)
        ? current
        : next.connections[0]?.id || "",
    );
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("googleCalendar")) {
      url.searchParams.delete("googleCalendar");
      url.searchParams.delete("googleConnection");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    const controller = new AbortController();
    void api<GoogleCalendarStatus>(googleCalendarEndpoint, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) updateStatus(next);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Die Google-Verbindungen konnten nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, updateStatus]);
  const run: GoogleCalendarRun = async (operation, action) => {
    setPending(operation);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Die Google-Verbindung konnte nicht geändert werden.",
      );
      try {
        updateStatus(await api<GoogleCalendarStatus>(googleCalendarEndpoint));
      } catch {
        /* Keep the actionable original error. */
      }
    } finally {
      setPending("");
    }
  };
  const connect = (connectionId?: string) =>
    void run("connect", async () => {
      const result = await post<{ url: string }>(`${googleCalendarEndpoint}/connect`, {
        returnTo,
        ...(connectionId ? { connectionId } : {}),
      });
      window.location.assign(result.url);
    });
  const header: ReactNode = (
    <>
      <p>
        Übertrage ausgewählte Termine in deine Google-Kalender. Du kannst mehrere Google-Konten und
        je Konto mehrere Kalender verbinden.
      </p>
      {notice && (
        <p role="status" className="success-message">
          <Check size={16} />
          {notice}
        </p>
      )}
      <ErrorMessage message={error} />
      {!status && loading && (
        <p role="status" className="muted">
          Verbindungen werden geladen …
        </p>
      )}
      {error && !status && (
        <Button
          disabled={Boolean(pending) || loading}
          onClick={() => {
            setLoading(true);
            setError("");
            setReload((value) => value + 1);
          }}
        >
          Verbindungen neu laden
        </Button>
      )}
      {status?.configured === false && (
        <p className="muted">
          Die Google-Anbindung wird noch eingerichtet. Du kannst bis dahin den Kalenderlink unter
          Einstellungen verwenden.
        </p>
      )}
      {Boolean(status?.connections.length) && (
        <div className={styles.accountPicker}>
          <label>
            Google-Konto
            <select
              value={account?.id || ""}
              disabled={Boolean(pending)}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setError("");
                setNotice("");
              }}
            >
              {status!.connections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.email} · {item.calendars.length} Kalender
                </option>
              ))}
            </select>
          </label>
          <Button disabled={Boolean(pending)} onClick={() => connect()}>
            <Plus size={16} />
            Google-Konto hinzufügen
          </Button>
        </div>
      )}
    </>
  );
  return (
    <Modal
      title="Google Kalender verbinden"
      className={styles.dialog}
      onClose={pending ? () => {} : onClose}
    >
      {account ? (
        <GoogleCalendarAccountEditor
          key={account.id}
          account={account}
          initialSelection={initialSelection}
          header={header}
          pending={pending}
          run={run}
          onStatusChange={updateStatus}
          onNotice={setNotice}
          onConnect={() => connect(account.id)}
          onClose={onClose}
        />
      ) : (
        <>
          <div className={styles.content}>
            {header}
            {status?.configured && (
              <>
                <div className={styles.disclosure}>
                  <strong>Du bestimmst, was übertragen wird.</strong>
                  <p>
                    Nach der Google-Freigabe wählst du einen eigenen Zielkalender und die Personen
                    aus. Google fragt nach deiner Kontoidentität, deiner Kalenderliste und
                    Terminrechten für deine eigenen Kalender. DigitalMask bearbeitet dort
                    ausschließlich selbst angelegte Einträge.
                  </p>
                  <a href="/google-calendar" target="_blank" rel="noreferrer">
                    Hinweise zur Google-Verbindung und Datennutzung
                  </a>
                </div>
                <Button variant="primary" disabled={Boolean(pending)} onClick={() => connect()}>
                  <Link2 size={16} />
                  {pending === "connect"
                    ? "Google wird geöffnet …"
                    : "Mit Google Kalender verbinden"}
                </Button>
              </>
            )}
          </div>
          <footer className="dialog-footer">
            <Button disabled={Boolean(pending)} onClick={onClose}>
              Schließen
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}
