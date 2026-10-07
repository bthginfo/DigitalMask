"use client";
import { useState } from "react";
import { CalendarRange, Pencil, Plus, Trash2, X } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { numberValue, textValue } from "@/shared/contracts";
import {
  dateLabel,
  instantDate,
  localDate,
  localDateTime,
  post,
  shiftDate,
} from "@/shared/client-api";
import { numberDraft, parseNumberDraft } from "@/shared/number-draft";
import { canManageRecord } from "@/shared/record-permissions";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import styles from "@/modules/workflows/components/workflow.module.css";

export function MaterialReservations({ material }: { material: DomainRecord }) {
  const { workspace, save, remove, busy } = useWorkspace();
  const [editor, setEditor] = useState<DomainRecord | "new" | null>(null);
  const [history, setHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(Date.now);
  const records = (workspace.records.reservations || [])
    .filter((row) => row.data.materialId === material.id)
    .sort(
      (a, b) =>
        Date.parse(String(a.data.start)) - Date.parse(String(b.data.start)) ||
        a.id.localeCompare(b.id),
    );
  const current = records.filter(
    (row) => row.data.status !== "cancelled" && Date.parse(String(row.data.end)) > now,
  );
  const visible = history ? records : current;
  const cancel = async (record: DomainRecord) => {
    if (!confirm("Diese Reservierung aufheben? Der Artikel wird für den Zeitraum wieder frei."))
      return;
    setError("");
    try {
      await save("reservations", { status: "cancelled" }, record);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Reservierung konnte nicht aufgehoben werden.",
      );
    }
  };
  return (
    <section className={styles.section} aria-label="Reservierungen für diesen Artikel">
      <div className={styles.heading}>
        <div>
          <h3>Reservierungen</h3>
          <span className="small muted">
            {current.length} aktuell · Bestand{" "}
            {numberValue(material.data.quantity).toLocaleString("de-DE")}
          </span>
        </div>
        <Button onClick={() => setEditor("new")}>
          <Plus size={15} />
          Reservieren
        </Button>
      </div>
      <div className={styles.filters}>
        <label className="small">
          Zeitraum{" "}
          <select
            value={history ? "all" : "current"}
            onChange={(event) => setHistory(event.target.value === "all")}
          >
            <option value="current">Aktuell und geplant</option>
            <option value="all">Alle Reservierungen</option>
          </select>
        </label>
        {records.length > 0 && <ExportButton onClick={() => setExporting(true)} />}
      </div>
      {!visible.length && (
        <p className={styles.empty}>
          Noch keine Reservierungen in dieser Auswahl. Du kannst diesen Artikel für ein Stück oder
          eine andere Verwendung vormerken.
        </p>
      )}
      <div className={styles.list}>
        {visible.map((record) => {
          const production = workspace.records.productions.find(
            (row) => row.id === record.data.productionId,
          );
          const actor = workspace.records.actors.find((row) => row.id === record.data.actorId);
          const owner = workspace.members.find((member) => member.id === record.data.userId);
          const canEdit = canManageRecord(workspace.user, "reservations", record);
          return (
            <article className={styles.row} key={record.id}>
              <div className={styles.rowHeading}>
                <h4>
                  {numberValue(record.data.quantity).toLocaleString("de-DE")} ×{" "}
                  {textValue(record.data.purpose) ||
                    textValue(production?.data.title) ||
                    "Reserviert"}
                </h4>
                <Badge tone={record.data.status === "cancelled" ? "neutral" : "success"}>
                  {record.data.status === "cancelled" ? "Aufgehoben" : "Reserviert"}
                </Badge>
              </div>
              <p className="small">
                <CalendarRange size={13} aria-hidden="true" />{" "}
                <time>
                  {dateLabel(textValue(record.data.start), true)} –{" "}
                  {dateLabel(textValue(record.data.end), true)}
                </time>
              </p>
              <p className={styles.note}>
                {[
                  owner?.name || "Ehemaliges Teammitglied",
                  textValue(production?.data.title),
                  textValue(actor?.data.name),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {!!record.data.notes && <p className={styles.note}>{String(record.data.notes)}</p>}
              {canEdit && (
                <div className={styles.actions}>
                  <Button disabled={busy} onClick={() => setEditor(record)}>
                    <Pencil size={14} />
                    Bearbeiten
                  </Button>
                  {record.data.status !== "cancelled" && (
                    <Button disabled={busy} onClick={() => void cancel(record)}>
                      <X size={14} />
                      Aufheben
                    </Button>
                  )}
                  {(record.data.status === "cancelled" ||
                    Date.parse(String(record.data.end)) <= now) && (
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm("Diese Reservierung entfernen?")) return;
                        setError("");
                        try {
                          await remove(record);
                        } catch (exception) {
                          setError(
                            exception instanceof Error
                              ? exception.message
                              : "Reservierung konnte nicht entfernt werden.",
                          );
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Entfernen
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className={styles.note}>
        Die Verfügbarkeit berücksichtigt auch Reservierungen aus anderen Produktionen. Nur die
        eigenen Reservierungen können von Teammitgliedern geändert werden; Admins können alle
        ändern.
      </p>
      <ErrorMessage message={error} />
      {editor && (
        <ReservationEditor
          material={material}
          record={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {exporting && (
        <ExportDialog
          kind="reservations"
          filters={{ materialId: material.id }}
          onClose={() => setExporting(false)}
        />
      )}
    </section>
  );
}

export function ReservationEditor({
  material,
  record,
  onClose,
}: {
  material: DomainRecord;
  record?: DomainRecord;
  onClose: () => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const [start, setStart] = useState(
    record ? localDateTime(textValue(record.data.start)) : `${localDate()}T09:00`,
  );
  const [end, setEnd] = useState(
    record ? localDateTime(textValue(record.data.end)) : `${shiftDate(localDate(), 1)}T18:00`,
  );
  const [quantity, setQuantity] = useState(numberDraft(record?.data.quantity, 1));
  const [productionId, setProductionId] = useState(textValue(record?.data.productionId));
  const [actorId, setActorId] = useState(textValue(record?.data.actorId));
  const [purpose, setPurpose] = useState(textValue(record?.data.purpose));
  const [notes, setNotes] = useState(textValue(record?.data.notes));
  const [status, setStatus] = useState(textValue(record?.data.status, "reserved"));
  const [preview, setPreview] = useState<{ available: number; sufficient: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const data = () => {
    const amount = parseNumberDraft(quantity, {
      label: "die Menge",
      required: true,
      min: 0.001,
      max: 1000000,
    })!;
    if (!start || !end || instantDate(end) <= instantDate(start))
      throw new Error("Bitte prüfe den Zeitraum. Das Ende muss nach dem Beginn liegen.");
    return {
      materialId: material.id,
      quantity: amount,
      start: instantDate(start).toISOString(),
      end: instantDate(end).toISOString(),
      productionId,
      actorId,
      purpose,
      notes,
      status,
    };
  };
  const check = async () => {
    setChecking(true);
    setError("");
    try {
      setPreview(
        await post("/api/reservations/availability", {
          ...data(),
          ...(record ? { excludeId: record.id } : {}),
        }),
      );
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Verfügbarkeit konnte nicht geprüft werden.",
      );
    } finally {
      setChecking(false);
    }
  };
  const clearPreview = () => setPreview(null);
  return (
    <Modal
      title={record ? "Reservierung bearbeiten" : "Artikel reservieren"}
      onClose={busy ? () => {} : onClose}
    >
      <form
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save("reservations", data(), record);
            onClose();
          } catch (exception) {
            setError(
              exception instanceof Error
                ? exception.message
                : "Reservierung konnte nicht gespeichert werden.",
            );
          }
        }}
      >
        <p>
          <strong>{textValue(material.data.name)}</strong>
          <br />
          <span className={styles.note}>
            Bestand: {numberValue(material.data.quantity).toLocaleString("de-DE")}
          </span>
        </p>
        <div className="form-grid">
          <label>
            Menge
            <input
              required
              type="number"
              min="0.001"
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                clearPreview();
              }}
            />
          </label>
          {record?.data.status === "cancelled" && (
            <label>
              Reservierung
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  clearPreview();
                }}
              >
                <option value="cancelled">Aufgehoben</option>
                <option value="reserved">Wieder reservieren</option>
              </select>
            </label>
          )}
          <label>
            Von
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(event) => {
                const oldDay = start.slice(0, 10);
                const next = event.target.value;
                setStart(next);
                if (end.slice(0, 10) === oldDay || instantDate(end) <= instantDate(next))
                  setEnd(`${next.slice(0, 10)}T${end.slice(11) || "18:00"}`);
                clearPreview();
              }}
            />
          </label>
          <label>
            Bis
            <input
              required
              type="datetime-local"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                clearPreview();
              }}
            />
          </label>
          <label>
            Produktion · optional
            <select value={productionId} onChange={(event) => setProductionId(event.target.value)}>
              <option value="">Ohne Produktion</option>
              {workspace.records.productions.map((row) => (
                <option key={row.id} value={row.id}>
                  {textValue(row.data.title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Schauspielperson · optional
            <select value={actorId} onChange={(event) => setActorId(event.target.value)}>
              <option value="">Keine Person</option>
              {workspace.records.actors.map((row) => (
                <option key={row.id} value={row.id}>
                  {textValue(row.data.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Verwendung · optional
            <input
              maxLength={200}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="z. B. Anprobe oder Vorbereitung"
            />
          </label>
          <label className="field-wide">
            Hinweise · optional
            <textarea
              rows={3}
              maxLength={20000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.availability}>
          <p className={styles.note}>
            {preview
              ? `Für den Zeitraum verfügbar: ${preview.available.toLocaleString("de-DE")}. ${preview.sufficient ? "Die gewünschte Menge passt." : "Bitte Menge oder Zeitraum anpassen."}`
              : "Prüfe bei Bedarf den verfügbaren Bestand. Beim Speichern wird die Verfügbarkeit erneut geprüft."}
          </p>
          <Button disabled={checking || busy} onClick={() => void check()}>
            {checking ? "Wird geprüft …" : "Verfügbarkeit prüfen"}
          </Button>
        </div>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" disabled={busy || checking}>
            {busy ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
