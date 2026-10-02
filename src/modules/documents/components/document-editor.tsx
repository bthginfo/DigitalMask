"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  CloudOff,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Table2,
  Users,
} from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { useSharedDocument } from "../client/use-shared-document";
import { TextEditor } from "./text-editor";
import { SheetEditor } from "./sheet-editor";
import { PdfNotesEditor } from "./pdf-notes-editor";
import "../documents.css";

const statusLabels = {
  loading: "Wird geöffnet …",
  saved: "Gespeichert",
  saving: "Wird gespeichert …",
  offline: "Offline",
  error: "Nicht gespeichert",
  forbidden: "Zugriff beendet",
};
export default function DocumentEditor({
  file,
  onClose,
}: {
  file: DomainRecord;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const {
    client,
    session,
    status,
    connected,
    pending,
    localReady,
    error: syncError,
  } = useSharedDocument(file.id, workspace.user.id);
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [leave, setLeave] = useState(false);
  const [activeSheet, setActiveSheet] = useState("");
  const editable = !!session?.canEdit && !["loading", "forbidden"].includes(status);
  const attempt = async (fn: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Aktion fehlgeschlagen.");
    } finally {
      setWorking(false);
    }
  };
  const close = () =>
    void attempt(async () => {
      try {
        await client?.flush();
        if (status !== "forbidden") await client?.checkpoint();
        onClose();
      } catch (exception) {
        setLeave(true);
        throw exception;
      }
    });
  const download = (format: string) =>
    void attempt(async () => {
      if (!client) return;
      await client.flush();
      const url = `/api/documents/${file.id}/export?format=${format}${format === "csv" && activeSheet ? `&sheet=${encodeURIComponent(activeSheet)}` : ""}`;
      let response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (response.status === 409 && failure.code === "document_session_expired") {
          await client.renewSession();
          response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        } else throw new Error(failure.error || "Die Datei konnte nicht heruntergeladen werden.");
      }
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "Die Datei konnte nicht heruntergeladen werden.");
      }
      const disposition = response.headers.get("Content-Disposition") || "";
      let filename =
        (session?.name || value(file.data, "name")).replace(/\.[^.]+$/, "") + `.${format}`;
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i),
        quoted = disposition.match(/filename="([^"]+)"/i);
      if (encoded) {
        try {
          filename = decodeURIComponent(encoded[1]);
        } catch {
          /* Use safe fallback. */
        }
      } else if (quoted) filename = quoted[1];
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    });
  const mainFormat =
    session?.format === "sheet" ? "xlsx" : session?.format === "pdf" ? "pdf" : "docx";
  const alternatives =
    session?.format === "sheet"
      ? ["xlsx", "csv", "pdf"]
      : session?.format === "pdf"
        ? ["pdf"]
        : ["docx", "pdf", "txt"];
  const StatusIcon =
    status === "saving" || status === "loading" ? Loader2 : status === "offline" ? CloudOff : Check;
  return (
    <Modal
      title={session?.name || value(file.data, "name") || "Gemeinsames Dokument"}
      onClose={close}
      wide
      className="document-editor-dialog"
    >
      <div className="document-editor-heading">
        <div className="document-shared-label">
          <Users size={16} />
          <span>Gemeinsames Dokument</span>
          {session && !session.canEdit && <span className="badge">Nur lesen</span>}
        </div>
        <span
          className={`document-save-status ${status}`}
          role="status"
          title={pending && status === "offline" ? "Noch nicht an das Team übertragen" : undefined}
        >
          <StatusIcon
            size={15}
            className={status === "saving" || status === "loading" ? "spin" : ""}
          />
          {statusLabels[status]}
          {status === "offline" && pending && localReady ? " · auf diesem Gerät" : ""}
        </span>
        <span
          className={`document-live-dot ${connected ? "connected" : ""}`}
          title={
            connected
              ? "Änderungen werden live mit dem Team geteilt"
              : "Live-Verbindung wird wiederhergestellt"
          }
          aria-label={connected ? "Live verbunden" : "Live-Verbindung pausiert"}
        />
      </div>
      {(error || syncError) && (
        <div className="document-sync-error">
          <ErrorMessage message={error || syncError} />
          {status !== "forbidden" && (
            <Button
              disabled={working}
              onClick={() =>
                void attempt(async () => {
                  await client?.retry();
                })
              }
            >
              <RefreshCw size={15} /> Erneut versuchen
            </Button>
          )}
        </div>
      )}
      {leave && (
        <div className="document-close-warning" role="alert">
          <p>
            {localReady
              ? "Diese Änderungen sind noch nicht beim Team gespeichert. Du kannst sie auf diesem Gerät behalten und später übertragen."
              : "Diese Änderungen konnten noch nicht gespeichert werden. Lass das Dokument geöffnet, bis die Verbindung wieder verfügbar ist."}
          </p>
          {localReady && <Button onClick={onClose}>Lokal behalten & schließen</Button>}
        </div>
      )}
      {session && session.metadata.warnings.length > 0 && (
        <details className="document-import-info">
          <summary>
            Hinweise zur übernommenen Datei <ChevronDown size={15} />
          </summary>
          <ul>
            {session.metadata.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
          <p>
            Die ursprüngliche Datei bleibt erhalten. Herunterladen enthält euren aktuellen
            gemeinsamen Stand.
          </p>
        </details>
      )}
      {status === "loading" ? (
        <div className="document-loading">
          <Loader2 size={30} className="spin" />
          <strong>Dokument wird geöffnet …</strong>
          <p>Der gemeinsame Stand wird geladen.</p>
        </div>
      ) : !session ? (
        <div className="document-loading">
          <FileText size={32} />
          <strong>Das Dokument konnte nicht geöffnet werden.</strong>
          <p>Versuche es mit einer aktiven Verbindung erneut.</p>
        </div>
      ) : status === "forbidden" ? (
        <div className="document-loading">
          <FileText size={32} />
          <strong>Dieses Dokument ist nicht mehr zugänglich.</strong>
        </div>
      ) : (
        <div className="document-editor-canvas">
          {session.format === "text" ? (
            <TextEditor doc={client!.doc} editable={editable} />
          ) : session.format === "sheet" ? (
            <SheetEditor
              doc={client!.doc}
              info={session.metadata.sheets || []}
              editable={editable}
              onSheetChange={setActiveSheet}
            />
          ) : (
            <PdfNotesEditor
              doc={client!.doc}
              fileId={file.id}
              pages={session.metadata.pdfPages || 1}
              user={workspace.user}
              editable={editable}
            />
          )}
        </div>
      )}
      <footer className="document-editor-footer">
        <a
          className="document-original-link"
          aria-label="Originaldatei herunterladen"
          title="Originaldatei herunterladen"
          href={`/api/files/${file.id}`}
          download={session?.metadata.sourceName || value(file.data, "name")}
        >
          <Download size={15} /> Original
        </a>
        <div className="document-footer-actions">
          <Button
            disabled={working || !session || status === "forbidden"}
            onClick={() =>
              void attempt(async () => {
                await client?.checkpoint();
              })
            }
          >
            <Save size={15} />
            {working ? "Bitte warten …" : "Speichern"}
          </Button>
          <div className="document-download-group">
            <Button
              variant="primary"
              disabled={working || !session || status === "forbidden"}
              onClick={() => download(mainFormat)}
            >
              <Download size={16} />
              <span>Herunterladen</span>
              <span className="document-format-label">{mainFormat.toUpperCase()}</span>
            </Button>
            <details className="document-download-options">
              <summary className="button primary" aria-label="Weitere Download-Formate">
                <ChevronDown size={16} />
              </summary>
              <div className="document-download-menu">
                {alternatives.map((format) => (
                  <button
                    key={format}
                    disabled={working || !session}
                    onClick={() => download(format)}
                  >
                    {format === "xlsx" ? <Table2 size={16} /> : <FileText size={16} />}
                    {format === "txt"
                      ? "Text (.txt)"
                      : format === "csv"
                        ? "CSV (aktuelles Blatt)"
                        : format.toUpperCase()}{" "}
                    herunterladen
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </footer>
    </Modal>
  );
}
