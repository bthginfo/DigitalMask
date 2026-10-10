"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, hours, num, value } from "@/shared/client-api";
import { canManageRecord } from "@/shared/record-permissions";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";

export function TimeBookingDelete({
  record,
  onDeleted,
}: {
  record: DomainRecord;
  onDeleted?: () => void;
}) {
  const { workspace, remove, busy, notify } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const current = workspace.records[record.kind].find((row) => row.id === record.id) || record;
  if (
    !["time", "attendance"].includes(current.kind) ||
    !canManageRecord(workspace.user, current.kind, current)
  )
    return null;
  const attendance = current.kind === "attendance";
  const title = value(current.data, "title") || (attendance ? "Anwesenheit" : "Zeitbuchung");
  const close = () => {
    if (!pending.current) setConfirming(false);
  };
  const deleteBooking = async () => {
    if (pending.current || busy) return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      await remove(current);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Löschen fehlgeschlagen.");
      return;
    } finally {
      pending.current = false;
      setDeleting(false);
    }
    notify(attendance ? "Anwesenheit gelöscht." : "Produktionsstunden gelöscht.");
    setConfirming(false);
    onDeleted?.();
  };
  return (
    <>
      <Button
        variant="danger-ghost"
        disabled={busy}
        title={`${title} vom ${dateLabel(value(current.data, "date"))} löschen`}
        onClick={() => {
          setError("");
          setConfirming(true);
        }}
      >
        <Trash2 size={15} /> Löschen
      </Button>
      {confirming &&
        createPortal(
          <Modal
            title={attendance ? "Anwesenheit löschen" : "Produktionsstunden löschen"}
            onClose={close}
          >
            <p>
              Möchtest du diese Buchung endgültig löschen? Sie wird aus den Stundensummen entfernt.
            </p>
            <p>
              <strong>{title}</strong>
              <br />
              {dateLabel(value(current.data, "date"))} ·{" "}
              {hours(num(current.data, "durationSeconds"))} h
            </p>
            {value(current.data, "start") && value(current.data, "end") && (
              <p className="small muted">
                {dateLabel(value(current.data, "start"), true)} –{" "}
                {dateLabel(value(current.data, "end"), true)}
              </p>
            )}
            <ErrorMessage message={error} />
            <footer className="dialog-footer">
              <Button disabled={deleting} onClick={close}>
                Abbrechen
              </Button>
              <Button
                variant="danger-ghost"
                disabled={busy || deleting}
                onClick={() => void deleteBooking()}
              >
                {deleting ? "Wird gelöscht …" : "Endgültig löschen"}
              </Button>
            </footer>
          </Modal>,
          document.body,
        )}
    </>
  );
}
