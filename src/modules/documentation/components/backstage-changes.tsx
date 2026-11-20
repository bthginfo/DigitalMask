"use client";

import { useState } from "react";
import { Download, Pencil, Plus } from "lucide-react";
import { downloadExport } from "@/components/export-dialog";
import { LinkedText } from "@/components/linked-text";
import { Button, Empty, ErrorMessage, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { backstageChangesFilename, productionBackstageChanges } from "@/shared/backstage-changes";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { backstageChangesSection } from "@/shared/document-sections";
import { canManageRecord } from "@/shared/record-permissions";
import { DocumentEditor } from "./document-editor";
import styles from "./backstage-changes.module.css";

export function BackstageChanges({ production }: { production: DomainRecord }) {
  const { workspace } = useWorkspace();
  const [targetId, setTargetId] = useState("");
  const [editing, setEditing] = useState<{ record?: DomainRecord } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const rows = productionBackstageChanges({
    productionId: production.id,
    looks: workspace.records.looks,
    actors: workspace.records.actors,
    characters: workspace.records.characters,
  });
  const filled = rows.filter((row) => row.entries.length);
  const editable = rows.filter(({ record }) => canManageRecord(workspace.user, "looks", record));
  const target = editable.find(({ record }) => record.id === targetId);
  const canCreate = canManageRecord(workspace.user, "looks");
  const create = canCreate && (targetId === "new" || !editable.length);

  async function exportChanges() {
    setExporting(true);
    setError("");
    try {
      const query = new URLSearchParams({
        kind: "looks",
        format: "pdf",
        view: backstageChangesSection.key,
        productionId: production.id,
      });
      await downloadExport(query, backstageChangesFilename(textValue(production.data.title)));
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Der Export konnte nicht erstellt werden.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="Umzüge der Produktion">
      <PageHeader title={backstageChangesSection.name} compact>
        <Button
          variant="primary"
          disabled={!filled.length || exporting}
          onClick={() => void exportChanges()}
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? "PDF wird erstellt …" : "PDF herunterladen"}
        </Button>
      </PageHeader>
      <ErrorMessage message={error} />
      {(editable.length > 0 || canCreate) && (
        <div className={styles.tools}>
          {editable.length > 0 && (
            <label>
              Aufschrieb für Umzüge
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">Aufschrieb auswählen</option>
                {editable.map(({ record, actor, figure }) => (
                  <option value={record.id} key={record.id}>
                    {actor}
                    {figure ? ` · ${figure}` : ""}
                  </option>
                ))}
                {canCreate && <option value="new">Neuen Aufschrieb anlegen</option>}
              </select>
            </label>
          )}
          <Button
            disabled={!target && !create}
            onClick={() => setEditing({ record: target?.record })}
          >
            <Plus size={16} aria-hidden="true" />
            Umzüge eintragen
          </Button>
        </div>
      )}
      {filled.length ? (
        <ul className={styles.list} aria-label="Backstage-Umzüge">
          {filled.map(({ record, actor, figure, entries }) => (
            <li className={styles.row} key={record.id}>
              <div className={styles.person}>
                <h3>{actor}</h3>
                {figure && <p className="small muted">{figure}</p>}
              </div>
              <div className={styles.steps}>
                {entries.map((entry) => (
                  <p key={entry.id}>
                    {entry.label?.trim() && <strong>{entry.label.trim()} </strong>}
                    <LinkedText>{entry.text.trim()}</LinkedText>
                  </p>
                ))}
              </div>
              {canManageRecord(workspace.user, "looks", record) && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Umzüge für ${actor}${figure ? ` (${figure})` : ""} bearbeiten`}
                  title="Umzüge bearbeiten"
                  onClick={() => setEditing({ record })}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="Noch keine Umzüge eingetragen"
          description={
            editable.length
              ? "Wähle einen Aufschrieb für die Wechsel hinter der Bühne."
              : "Über „Umzüge eintragen“ legst du den ersten Eintrag für diese Produktion an."
          }
        />
      )}
      {editing && (
        <DocumentEditor
          kind="looks"
          record={editing.record}
          lockedProductionId={production.id}
          backstageChangesOnly
          onSaved={(record) => setTargetId(record.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
