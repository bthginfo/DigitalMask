"use client";
import { useState } from "react";
import Papa from "papaparse";
import { Download, Upload } from "lucide-react";
import type { RecordData, RecordKind } from "@/shared/contracts";
import { localDate, post } from "@/shared/client-api";
import { Button, ErrorMessage, Modal } from "./ui";
import { useWorkspace } from "./workspace-context";
import { fields, labels } from "./resource-fields";
export function ExportDialog({
  kind,
  filters = {},
  onClose,
}: {
  kind: RecordKind;
  filters?: Record<string, string>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState("pdf");
  const [from, setFrom] = useState(filters.from || "");
  const [to, setTo] = useState(filters.to || "");
  const [view, setView] = useState(filters.view || "agenda");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        ...filters,
        kind,
        format,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        view,
      });
      const response = await fetch(`/api/export?${query}`, { credentials: "same-origin" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Der Export konnte nicht erstellt werden.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `digitalmask-${kind}-${localDate()}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${labels[kind][0]} exportieren`} onClose={onClose}>
      <p className="muted">
        PDF für Ausdrucke, Excel für Auswertungen oder offene Formate zur Weiterverarbeitung. Deine
        aktuellen Filter werden übernommen.
      </p>
      <div className="form-grid">
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            {["pdf", "xlsx", "csv", "json", ...(kind === "events" ? ["ics"] : [])].map((x) => (
              <option key={x} value={x}>
                {
                  (
                    {
                      pdf: "PDF · Drucklayout",
                      xlsx: "Excel · XLSX",
                      csv: "CSV · Tabelle",
                      json: "JSON · Daten",
                      ics: "ICS · Kalender",
                    } as Record<string, string>
                  )[x]
                }
              </option>
            ))}
          </select>
        </label>
        {kind === "events" && (
          <label>
            Layout
            <select value={view} onChange={(event) => setView(event.target.value)}>
              {[
                ["month", "Monat"],
                ["week", "Woche"],
                ["day", "Tag"],
                ["agenda", "Agenda"],
                ["team", "Teamübersicht"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Von (optional)
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bis (optional)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <ErrorMessage message={error} />
      <footer className="dialog-footer">
        <Button onClick={onClose}>Schließen</Button>
        <Button variant="primary" onClick={() => void download()} disabled={busy}>
          <Download size={16} />
          {busy ? "Export wird erstellt …" : "Herunterladen"}
        </Button>
      </footer>
    </Modal>
  );
}
export function ImportDialog({ kind, onClose }: { kind: RecordKind; onClose: () => void }) {
  const { refresh, workspace } = useWorkspace();
  const [rows, setRows] = useState<RecordData[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const parse = (file: File) => {
    setError("");
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete(parsed) {
        if (parsed.errors.length) {
          setError(`CSV-Zeile ${(parsed.errors[0].row || 0) + 2}: ${parsed.errors[0].message}`);
          setRows([]);
          return;
        }
        if (parsed.data.length > 200) {
          setError("Bitte höchstens 200 Zeilen je Import verwenden.");
          setRows([]);
          return;
        }
        setRows(
          parsed.data.map((row) =>
            Object.fromEntries(
              Object.entries(row)
                .filter(([, val]) => val !== "")
                .map(([key, val]) => [
                  key,
                  /^(quantity|minQuantity|durationSeconds|pauseSeconds|durationMinutes|version)$/.test(
                    key,
                  )
                    ? Number(val)
                    : /^(alternate|read)$/.test(key)
                      ? val === "true"
                      : /^[\[{]/.test(val)
                        ? (() => {
                            try {
                              return JSON.parse(val);
                            } catch {
                              return val;
                            }
                          })()
                        : val,
                ]),
            ),
          ),
        );
      },
      error(e) {
        setError(e.message);
      },
    });
  };
  const template = () => {
    const columns = (fields[kind] || []).map((field) => field.key);
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + Papa.unparse([columns]) + "\r\n"], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `digitalmask-${kind}-importvorlage.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await post<{ imported: number; errors: { row: number; error: string }[] }>(
        "/api/import",
        { kind, rows },
      );
      setResult(next);
      setRows(next.errors.map((item) => rows[item.row - 1]).filter(Boolean));
      if (next.imported) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`${labels[kind][0]} importieren`} onClose={onClose} wide>
      <p className="muted">
        Verwende die Importvorlage mit technischen Feldnamen in der ersten Zeile. Ein Import legt
        neue Einträge an. Druck- und Berichtsexporte verwenden andere Spalten und sind keine
        Importvorlage.
      </p>
      <Button onClick={template}>
        <Download size={16} />
        CSV-Importvorlage herunterladen
      </Button>
      <details className="history-version">
        <summary>Felder, Formate & Zuordnungen</summary>
        <p className="small muted">
          Datum: JJJJ-MM-TT. Zeitpunkte: ISO mit Zeitzone. Dauer und Pause: Sekunden. Mehrfachwerte
          und Checklisten: JSON-Arrays. Zuordnungen verwenden die ID des Eintrags.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>CSV-Spalte</th>
                <th>Bedeutung</th>
              </tr>
            </thead>
            <tbody>
              {(fields[kind] || []).map((field) => (
                <tr key={field.key}>
                  <td>{field.key}</td>
                  <td>
                    {field.key === "durationSeconds"
                      ? "Arbeitsdauer in Sekunden"
                      : field.key === "pauseSeconds"
                        ? "Pause in Sekunden"
                        : field.label}
                    {field.required ? " · Pflichtfeld" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(fields[kind] || [])
          .filter((field) => field.source)
          .map((field) => (
            <details className="history-version" key={field.key}>
              <summary>IDs für {field.label}</summary>
              {field.source === "members"
                ? workspace.members.map((member) => (
                    <p className="small" key={member.id}>
                      {member.name} · <code>{member.id}</code>
                    </p>
                  ))
                : workspace.records[field.source!].map((record) => (
                    <p className="small" key={record.id}>
                      {String(record.data.title || record.data.name)} · <code>{record.id}</code>
                    </p>
                  ))}
            </details>
          ))}
      </details>
      <label className="file-drop">
        <Upload size={22} />
        CSV-Datei auswählen
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) parse(file);
          }}
        />
      </label>
      {result && (
        <section
          className={result.errors.length ? "error-message" : "success-message"}
          role="status"
        >
          <div>
            <strong>{result.imported} Einträge importiert.</strong>
            {result.errors.length > 0 && (
              <>
                <p>
                  {result.errors.length} Zeilen konnten nicht übernommen werden. Erfolgreiche
                  Einträge werden bei einem erneuten Versuch nicht wieder importiert.
                </p>
                <ul>
                  {result.errors.map((item) => (
                    <li key={item.row}>
                      Datenzeile {item.row}: {item.error}
                    </li>
                  ))}
                </ul>
                <p>
                  Du kannst die verbleibenden Zeilen erneut versuchen oder eine korrigierte
                  CSV-Datei mit ausschließlich diesen Zeilen auswählen.
                </p>
              </>
            )}
          </div>
        </section>
      )}
      {rows.length > 0 && (
        <>
          <p className="small">
            {rows.length} {result ? "verbleibende" : "gefundene"} Datensätze · Vorschau der ersten 5
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {Object.keys(rows[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {Object.keys(rows[0]).map((key) => (
                      <td key={key}>
                        {typeof row[key] === "object"
                          ? JSON.stringify(row[key])
                          : String(row[key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ErrorMessage message={error} />
      <footer className="dialog-footer">
        <Button onClick={onClose}>{result ? "Schließen" : "Abbrechen"}</Button>
        <Button variant="primary" disabled={!rows.length || busy} onClick={() => void submit()}>
          {busy ? "Wird importiert …" : `${rows.length} Einträge importieren`}
        </Button>
      </footer>
    </Modal>
  );
}
