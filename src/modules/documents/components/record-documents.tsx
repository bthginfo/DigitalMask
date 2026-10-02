"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { FileText, Plus, Trash2, Upload } from "lucide-react";
import { Button, Empty, ErrorMessage } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { canManageRecord } from "@/shared/record-permissions";
import type { DomainRecord } from "@/shared/contracts";
import { api, dateLabel, post, value } from "@/shared/client-api";
import { imageAccept, prepareUpload } from "@/shared/client-files";
import { DocumentAttachment } from "./document-attachment";
import { NewDocumentDialog } from "./new-document-dialog";
import "../documents.css";
const DocumentEditor = dynamic(() => import("./document-editor"), { ssr: false });

export const documentAccept = `.docx,.xlsx,.csv,.pdf,${imageAccept}`;
export function RecordDocuments({ record }: { record: DomainRecord }) {
  const { workspace, refresh } = useWorkspace();
  const [creating, setCreating] = useState(false),
    [opened, setOpened] = useState<DomainRecord | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const files = workspace.records.files.filter(
    (file) => file.data.recordKind === record.kind && file.data.recordId === record.id,
  );
  const canEdit = canManageRecord(workspace.user, record.kind, record);
  const upload = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(selected)) {
        const form = new FormData();
        form.append("file", await prepareUpload(file));
        form.append("recordKind", record.kind);
        form.append("recordId", record.id);
        await api("/api/files", { method: "POST", body: form });
      }
      await refresh();
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Datei konnte nicht hochgeladen werden.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="record-documents">
      <header className="record-documents-heading">
        <h2>Dokumente</h2>
        <div className="heading-actions">
          {canEdit && (
            <>
              <label className="button secondary">
                <Upload size={16} />
                {busy ? "Lädt hoch …" : "Hochladen"}
                <input
                  className="visually-hidden"
                  type="file"
                  accept={documentAccept}
                  multiple
                  disabled={busy}
                  onChange={(event) => {
                    void upload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <Button variant="primary" disabled={busy} onClick={() => setCreating(true)}>
                <Plus size={16} /> Dokument anlegen
              </Button>
            </>
          )}
        </div>
      </header>
      <ErrorMessage message={error} />
      {files.length ? (
        <div className="record-document-list">
          {files.map((file) => (
            <article key={file.id}>
              <FileText size={20} className="record-document-icon" />
              <div>
                <DocumentAttachment file={file} compact />
                <span className="small muted">
                  {dateLabel(file.createdAt)} ·{" "}
                  {value(file.data, "mime").startsWith("image/") ? "Bild" : "Gemeinsame Datei"}
                </span>
              </div>
              {canEdit && (
                <button
                  className="icon-button"
                  aria-label={`${value(file.data, "name")} löschen`}
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("Datei und ihren gemeinsamen Bearbeitungsstand löschen?")) return;
                    setBusy(true);
                    setError("");
                    void api(`/api/files/${file.id}`, { method: "DELETE" })
                      .then(refresh)
                      .catch((exception) =>
                        setError(
                          exception instanceof Error
                            ? exception.message
                            : "Löschen fehlgeschlagen.",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Platz für eure gemeinsamen Dokumente."
          description="Lade Word, Excel oder PDF hoch oder starte ein neues Textdokument. Ihr arbeitet alle am selben Stand und könnt ihn wieder herunterladen."
        />
      )}
      {creating && (
        <NewDocumentDialog
          onClose={() => setCreating(false)}
          onCreate={async (name, format) => {
            const file = await post<DomainRecord>("/api/documents", {
              recordKind: record.kind,
              recordId: record.id,
              name,
              format,
            });
            await refresh();
            setCreating(false);
            setOpened(file);
          }}
        />
      )}
      {opened && <DocumentEditor file={opened} onClose={() => setOpened(null)} />}
    </section>
  );
}
