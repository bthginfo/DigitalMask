"use client";
import { useState } from "react";
import { FileText, Table2 } from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import type { DocumentFormat } from "../contracts";
import "../documents.css";

export function NewDocumentDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string, format: Exclude<DocumentFormat, "pdf">) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [format, setFormat] = useState<"text" | "sheet">("text"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Gemeinsames Dokument anlegen"
      onClose={() => {
        if (!busy) onClose();
      }}
      className="new-document-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !name.trim()) return;
          setBusy(true);
          setError("");
          void onCreate(name.trim(), format).catch((exception) => {
            setError(
              exception instanceof Error
                ? exception.message
                : "Dokument konnte nicht angelegt werden.",
            );
            setBusy(false);
          });
        }}
      >
        <div className="new-document-types" role="group" aria-label="Dokumentart">
          <button
            type="button"
            aria-pressed={format === "text"}
            className={format === "text" ? "selected" : ""}
            onClick={() => setFormat("text")}
            disabled={busy}
          >
            <FileText size={25} />
            <strong>Textdokument</strong>
            <span>Texte, Listen & Tabellen</span>
          </button>
          <button
            type="button"
            aria-pressed={format === "sheet"}
            className={format === "sheet" ? "selected" : ""}
            onClick={() => setFormat("sheet")}
            disabled={busy}
          >
            <Table2 size={25} />
            <strong>Tabelle</strong>
            <span>Zellen & Berechnungen</span>
          </button>
        </div>
        <label htmlFor="new-document-name">Name</label>
        <input
          id="new-document-name"
          value={name}
          required
          maxLength={120}
          autoFocus
          disabled={busy}
          placeholder="Zum Beispiel: Vorbereitung Abschiedsdinner"
          onChange={(event) => setName(event.target.value)}
        />
        <p className="small muted">
          Alle Personen mit Zugriff auf diesen Bereich arbeiten im selben Dokument.
        </p>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Wird angelegt …" : "Anlegen & öffnen"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
