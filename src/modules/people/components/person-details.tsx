"use client";

import { useState } from "react";
import { LinkedText } from "@/components/linked-text";
import { Building2, Pencil, Trash2 } from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { PersonRelationships } from "@/components/record-relationships";
import { useWorkspace } from "@/components/workspace-context";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { canManageRecord } from "@/shared/record-permissions";
import { PersonContactLinks } from "./person-contact-links";
import { PersonEditor } from "./person-editor";
import styles from "./people.module.css";

/** The directory and crosslinks share the same contact detail dialog. */
export function PersonDetails({
  record,
  onClose,
  onNavigate = onClose,
}: {
  record: DomainRecord;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const { workspace, busy, online, remove, notify } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const current = workspace.records.people.find((person) => person.id === record.id) || record;
  const canManage = canManageRecord(workspace.user, "people", current);
  const close = () => {
    if (!deleting) onClose();
  };
  if (editing) return <PersonEditor record={current} onClose={() => setEditing(false)} />;
  return (
    <Modal title={confirmDelete ? "Kontakt löschen?" : "Kontaktdetails"} onClose={close} wide>
      <article className={styles.detail}>
        {confirmDelete ? (
          <>
            <p className={styles.intro}>
              <strong>{textValue(current.data.name)}</strong> wird aus dem Verzeichnis entfernt.
              Kontakte, die einer Produktion zugeordnet sind, bleiben geschützt.
            </p>
            <ErrorMessage message={error} />
            <div className={styles.actions}>
              <Button disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </Button>
              <Button
                variant="danger-ghost"
                disabled={busy || deleting || !online}
                onClick={async () => {
                  setDeleting(true);
                  setError("");
                  try {
                    await remove(current);
                    notify("Kontakt gelöscht.");
                    onClose();
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Der Kontakt konnte nicht gelöscht werden.",
                    );
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Wird gelöscht …" : "Kontakt löschen"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className={styles.detailTitle}>{textValue(current.data.name)}</h3>
            {textValue(current.data.position) && (
              <p className="muted">{textValue(current.data.position)}</p>
            )}
            <dl className={styles.details}>
              <div>
                <dt>
                  <Building2 size={13} /> Organisation
                </dt>
                <dd>{textValue(current.data.organization) || "Nicht hinterlegt"}</dd>
              </div>
              {textValue(current.data.notes) && (
                <div>
                  <dt>Notizen</dt>
                  <dd>
                    <LinkedText>{textValue(current.data.notes)}</LinkedText>
                  </dd>
                </div>
              )}
            </dl>
            <PersonContactLinks data={current.data} />
            <PersonRelationships record={current} onNavigate={onNavigate} />
            <div className={styles.actions}>
              {canManage && (
                <>
                  <Button onClick={() => setEditing(true)} disabled={busy || !online}>
                    <Pencil size={15} />
                    Bearbeiten
                  </Button>
                  <Button
                    variant="danger-ghost"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy || !online}
                  >
                    <Trash2 size={15} />
                    Löschen
                  </Button>
                </>
              )}
              <Button onClick={close}>Schließen</Button>
            </div>
          </>
        )}
      </article>
    </Modal>
  );
}
