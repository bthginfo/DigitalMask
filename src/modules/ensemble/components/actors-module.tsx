"use client";

import { useState } from "react";
import { Check, Download, ExternalLink, LoaderCircle, Users } from "lucide-react";
import { ResourceView } from "@/components/resource-view";
import { Badge, Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, initials, post } from "@/shared/client-api";

interface Preview {
  fetchedAt: string;
  summary: { create: number; update: number; conflict: number };
  entries: {
    sourceId: string;
    name: string;
    action: "create" | "update" | "conflict";
    recordId?: string;
  }[];
}
interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  images: number;
  errors: { name: string; error: string }[];
}

export function ActorsModule() {
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceView
        kind="actors"
        headerActions={
          workspace.user.role !== "user" ? (
            <Button onClick={() => setOpen(true)}>
              <Download size={16} />
              Ensemble laden
            </Button>
          ) : undefined
        }
      />
      {open && <EnsembleImport onClose={() => setOpen(false)} />}
    </>
  );
}

function EnsembleImport({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await api<Preview>("/api/ensemble");
      setPreview(next);
      setSelection(
        next.entries.filter((entry) => entry.action !== "conflict").map((entry) => entry.sourceId),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Das Ensemble konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  };
  const runImport = async () => {
    setImporting(true);
    setProgress(0);
    setError("");
    try {
      const combined: ImportResult = {
        created: 0,
        updated: 0,
        unchanged: 0,
        images: 0,
        errors: [],
      };
      for (let offset = 0; offset < selection.length; offset += 4) {
        const batch = selection.slice(offset, offset + 4);
        try {
          const next = await post<ImportResult>("/api/ensemble", { sourceIds: batch });
          combined.created += next.created;
          combined.updated += next.updated;
          combined.unchanged += next.unchanged;
          combined.images += next.images;
          combined.errors.push(...next.errors);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Import fehlgeschlagen";
          combined.errors.push(
            ...batch.map((sourceId) => ({
              name: preview?.entries.find((entry) => entry.sourceId === sourceId)?.name || sourceId,
              error: message,
            })),
          );
        }
        setProgress(Math.min(offset + batch.length, selection.length));
      }
      setResult(combined);
      await refresh();
      notify("Ensemble-Import abgeschlossen.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Der Import konnte nicht abgeschlossen werden.",
      );
    } finally {
      setImporting(false);
    }
  };
  const selectable = preview?.entries.filter((entry) => entry.action !== "conflict") || [];
  const allSelected =
    selectable.length > 0 && selectable.every((entry) => selection.includes(entry.sourceId));
  return (
    <Modal
      title="Ensemble übernehmen"
      onClose={() => {
        if (!importing) onClose();
      }}
      wide
      className="ensemble-import-dialog"
    >
      <div className="ensemble-import-body">
        <div className="ensemble-source">
          <Users size={24} />
          <div>
            <strong>Stadttheater Ingolstadt · Ensemble & Gäste</strong>
            <a
              href="https://theater.ingolstadt.de/ensemble/schauspielerinnen.html"
              target="_blank"
              rel="noreferrer"
            >
              Schauspiel <ExternalLink size={13} />
            </a>
            <a
              href="https://theater.ingolstadt.de/junges-theater/ensemble-jt.html"
              target="_blank"
              rel="noreferrer"
            >
              Junges Theater <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <p className="small muted">
          Ensemble und Gäste aus Schauspiel und Jungem Theater werden gemeinsam geladen. Neue
          Schauspieler werden ergänzt, vorhandene bei eindeutiger Zuordnung aktualisiert. Eure
          zusätzlichen Schauspieler, Maskenhinweise und Produktionszuordnungen bleiben erhalten.
        </p>
        <ErrorMessage message={error} />
        {result ? (
          <section className="ensemble-result" aria-live="polite">
            <Check size={24} />
            <h3>Import abgeschlossen</h3>
            <p>
              {result.created} neu · {result.updated} aktualisiert · {result.unchanged} unverändert
            </p>
            <p className="small muted">{result.images} Bilder übernommen</p>
            {result.errors.length > 0 && (
              <>
                <h4>Bitte prüfen</h4>
                <ul>
                  {result.errors.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <strong>{item.name}:</strong> {item.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : preview ? (
          <>
            <div className="ensemble-summary">
              <Badge tone="green">{preview.summary.create} neu</Badge>
              <Badge>{preview.summary.update} aktualisieren</Badge>
              {preview.summary.conflict > 0 && (
                <Badge tone="coral">{preview.summary.conflict} unklar</Badge>
              )}
            </div>
            <label className="check-label ensemble-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={importing || !selectable.length}
                onChange={(event) =>
                  setSelection(
                    event.target.checked ? selectable.map((entry) => entry.sourceId) : [],
                  )
                }
              />
              Alle eindeutigen Personen auswählen
            </label>
            <div className="ensemble-preview-list" aria-label="Personen für den Import">
              {preview.entries.map((entry) => (
                <label
                  key={entry.sourceId}
                  className={`ensemble-preview-row ${entry.action === "conflict" ? "conflict" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selection.includes(entry.sourceId)}
                    disabled={importing || entry.action === "conflict"}
                    onChange={(event) =>
                      setSelection((current) =>
                        event.target.checked
                          ? [...current, entry.sourceId]
                          : current.filter((id) => id !== entry.sourceId),
                      )
                    }
                  />
                  <span className="ensemble-initials" aria-hidden="true">
                    {initials(entry.name)}
                  </span>
                  <span className="ensemble-person-name">
                    <strong>{entry.name}</strong>
                    {entry.action === "conflict" && (
                      <span className="small muted">
                        Mehrere mögliche Einträge. Bitte im Katalog prüfen.
                      </span>
                    )}
                  </span>
                  <Badge
                    tone={
                      entry.action === "create"
                        ? "green"
                        : entry.action === "conflict"
                          ? "coral"
                          : "neutral"
                    }
                  >
                    {entry.action === "create"
                      ? "Neu"
                      : entry.action === "update"
                        ? "Aktualisieren"
                        : "Unklar"}
                  </Badge>
                </label>
              ))}
            </div>
            {!preview.entries.length && (
              <p className="small muted">
                Die Ensemble-Seite enthält zurzeit keine importierbaren Personen.
              </p>
            )}
          </>
        ) : (
          <div className="ensemble-import-start">
            <Download size={30} />
            <h3>Erst ansehen, dann übernehmen</h3>
            <p className="small muted">
              Lade das Ensemble und die Gäste mit Informationen und Porträts. Anschließend wählst du
              aus, welche Personen übernommen werden.
            </p>
            <Button variant="primary" disabled={loading} onClick={() => void load()}>
              {loading ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
              {loading ? "Ensemble wird geladen …" : "Vorschau laden"}
            </Button>
          </div>
        )}
      </div>
      <footer className="dialog-footer ensemble-import-footer">
        <span className="small muted" aria-live="polite">
          {importing
            ? `${progress} von ${selection.length} Personen geprüft …`
            : preview && !result
              ? `${selection.length} Personen ausgewählt`
              : ""}
        </span>
        <Button disabled={importing} onClick={onClose}>
          {result ? "Fertig" : "Abbrechen"}
        </Button>
        {preview && !result && (
          <Button
            variant="primary"
            disabled={importing || !selection.length}
            onClick={() => void runImport()}
          >
            {importing ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            {importing ? "Wird übernommen …" : "Importieren"}
          </Button>
        )}
      </footer>
    </Modal>
  );
}
