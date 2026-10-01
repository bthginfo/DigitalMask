"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { textValue, type DomainRecord, type RecordData } from "@/shared/contracts";
import { isDirectoryPerson } from "./person-data";
import styles from "./people.module.css";

export interface PersonEditorProps {
  record?: DomainRecord;
  defaults?: RecordData;
  onClose: () => void;
  onSaved?: (person: DomainRecord) => void;
  /** Inline mode never mounts another form or dialog inside a production form. */
  embedded?: boolean;
  onSelectExisting?: (person: DomainRecord) => void;
}
const fields = [
  { key: "name", label: "Name", maxLength: 200, required: true, autoComplete: "name" },
  { key: "organization", label: "Organisation", maxLength: 200, autoComplete: "organization" },
  { key: "position", label: "Funktion", maxLength: 200, autoComplete: "organization-title" },
  { key: "email", label: "E-Mail", maxLength: 320, type: "email", autoComplete: "email" },
  { key: "phone", label: "Telefon", maxLength: 100, type: "tel", autoComplete: "tel" },
] as const;

export function PersonEditor({
  record,
  defaults,
  onClose,
  onSaved,
  embedded = false,
  onSelectExisting,
}: PersonEditorProps) {
  const { workspace, save, busy, online, notify } = useWorkspace();
  const [draft, setDraft] = useState<RecordData>(() => ({ ...defaults, ...record?.data }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false),
    container = useRef<HTMLDivElement>(null),
    id = useId();
  const disabled = saving || busy || !online;
  const duplicates = workspace.records.people.filter(
    (person) =>
      isDirectoryPerson(person) &&
      person.id !== record?.id &&
      textValue(person.data.name).trim().toLocaleLowerCase("de") ===
        textValue(draft.name).trim().toLocaleLowerCase("de"),
  );
  const close = () => {
    if (!pending.current) onClose();
  };
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (disabled || pending.current) return;
    const invalid = container.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input:invalid,textarea:invalid",
    );
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    if (!textValue(draft.name).trim()) {
      setError("Bitte einen Namen eintragen.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    let person: DomainRecord;
    try {
      person = await save(
        "people",
        Object.fromEntries([
          ...fields.map((field) => [field.key, textValue(draft[field.key]).trim()]),
          ["notes", textValue(draft.notes).trim()],
        ]),
        record,
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Der Kontakt konnte nicht gespeichert werden.",
      );
      pending.current = false;
      setSaving(false);
      return;
    }
    pending.current = false;
    setSaving(false);
    notify(record ? "Kontakt aktualisiert." : "Kontakt angelegt.");
    onSaved?.(person);
    onClose();
  };
  const content = (
    <div className={styles.editor} ref={container} aria-busy={saving}>
      {embedded && <h3>Person anlegen</h3>}
      <p className={styles.intro}>
        Kontaktdaten für die Zusammenarbeit. Diese Person erhält dadurch keinen Benutzerzugang. Nur
        der Name ist erforderlich.
      </p>
      <div className="form-grid">
        {fields.map((field) => (
          <label
            key={field.key}
            htmlFor={`${id}-${field.key}`}
            className={field.key === "name" ? "full" : undefined}
          >
            {field.label}
            {"required" in field && field.required ? " *" : ""}
            <input
              id={`${id}-${field.key}`}
              type={"type" in field ? field.type : "text"}
              required={"required" in field && field.required}
              maxLength={field.maxLength}
              autoComplete={field.autoComplete}
              value={textValue(draft[field.key])}
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field.key]: event.target.value }))
              }
              disabled={disabled}
            />
          </label>
        ))}
        <label className="full" htmlFor={`${id}-notes`}>
          Notizen
          <textarea
            id={`${id}-notes`}
            maxLength={20000}
            rows={5}
            value={textValue(draft.notes)}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            disabled={disabled}
          />
        </label>
      </div>
      {duplicates.length > 0 && (
        <div className={styles.warning} role="status">
          Ein Kontakt mit diesem Namen ist bereits vorhanden. Prüfe, ob es dieselbe Person ist.
          {duplicates.map((person) =>
            onSelectExisting ? (
              <button
                key={person.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectExisting(person)}
              >
                Vorhandenen Kontakt wählen: {textValue(person.data.name)}
                {textValue(person.data.organization) && ` · ${textValue(person.data.organization)}`}
              </button>
            ) : (
              <p key={person.id}>
                {textValue(person.data.name)}
                {textValue(person.data.organization) && ` · ${textValue(person.data.organization)}`}
                {textValue(person.data.position) && ` · ${textValue(person.data.position)}`}
              </p>
            ),
          )}
        </div>
      )}
      {!online && (
        <p className={styles.status} role="status">
          Zum Speichern wird eine Internetverbindung benötigt. Deine Eingaben bleiben hier erhalten.
        </p>
      )}
      <ErrorMessage message={error} />
      <div className={styles.actions}>
        <Button onClick={close} disabled={saving}>
          Abbrechen
        </Button>
        <Button
          type={embedded ? "button" : "submit"}
          variant="primary"
          disabled={disabled}
          onClick={embedded ? () => void submit() : undefined}
        >
          <Save size={16} />
          {saving ? "Wird gespeichert …" : record ? "Änderungen speichern" : "Kontakt anlegen"}
        </Button>
      </div>
    </div>
  );
  return embedded ? (
    <section
      className={styles.inline}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.stopPropagation();
          void submit();
        }
      }}
    >
      {content}
    </section>
  ) : (
    <Modal title={record ? "Kontakt bearbeiten" : "Person anlegen"} onClose={close}>
      <form onSubmit={(event) => void submit(event)}>{content}</form>
    </Modal>
  );
}
