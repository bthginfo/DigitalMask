"use client";
import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { filterPeople } from "./person-data";
import { PersonEditor } from "./person-editor";
import { PersonContactLinks } from "./person-contact-links";
import styles from "./people.module.css";

export interface PersonPickerProps {
  value: string;
  onChange: (personId: string) => void;
  disabled?: boolean;
  label?: string;
  onCreated?: (person: DomainRecord) => void;
}
export function PersonPicker({
  value,
  onChange,
  disabled = false,
  label = "Person aus dem Verzeichnis",
  onCreated,
}: PersonPickerProps) {
  const { workspace, busy, online } = useWorkspace();
  const id = useId();
  const [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false);
  // Retain the saved record during a delayed workspace refresh, without touching
  // the surrounding production draft or starting another workspace request.
  const [created, setCreated] = useState<DomainRecord | undefined>();
  const people = useMemo(
    () =>
      created && !workspace.records.people.some((person) => person.id === created.id)
        ? [...workspace.records.people, created]
        : workspace.records.people,
    [created, workspace.records.people],
  );
  const selected = people.find((person) => person.id === value);
  const matches = filterPeople(people, query);
  const options =
    selected && !matches.some((person) => person.id === selected.id)
      ? [selected, ...matches]
      : matches;
  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeading}>
        <label htmlFor={`${id}-select`}>{label}</label>
        {workspace.user.role !== "user" && !creating && (
          <Button onClick={() => setCreating(true)} disabled={disabled || busy || !online}>
            <Plus size={14} />
            Person anlegen
          </Button>
        )}
      </div>
      <label className={styles.pickerSearch} htmlFor={`${id}-search`}>
        <span className="visually-hidden">Kontaktverzeichnis durchsuchen</span>
        <input
          id={`${id}-search`}
          type="search"
          placeholder="Name, Organisation oder Funktion suchen"
          value={query}
          disabled={disabled || creating}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
      </label>
      <select
        id={`${id}-select`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || creating}
      >
        <option value="">Person auswählen</option>
        {value && !selected && (
          <option value={value} disabled>
            Kontakt nicht mehr verfügbar
          </option>
        )}
        {options.map((person) => (
          <option key={person.id} value={person.id}>
            {textValue(person.data.name)}
            {textValue(person.data.organization) && ` · ${textValue(person.data.organization)}`}
            {textValue(person.data.position) && ` · ${textValue(person.data.position)}`}
          </option>
        ))}
      </select>
      {!matches.length && (
        <p className={styles.status} role="status">
          {people.length
            ? "Kein Kontakt passt zur Suche."
            : "Noch keine weiteren Personen im Verzeichnis."}
        </p>
      )}
      {selected && (
        <div className={styles.selected}>
          <strong>{textValue(selected.data.name)}</strong>
          {textValue(selected.data.position) && (
            <span className={styles.secondary}>{textValue(selected.data.position)}</span>
          )}
          <PersonContactLinks data={selected.data} empty="" />
        </div>
      )}
      {creating && (
        <PersonEditor
          embedded
          defaults={{ name: query.trim() }}
          onClose={() => setCreating(false)}
          onSelectExisting={(person) => {
            onChange(person.id);
            setCreating(false);
            setQuery("");
          }}
          onSaved={(person) => {
            setCreated(person);
            onChange(person.id);
            setQuery("");
            onCreated?.(person);
          }}
        />
      )}
    </div>
  );
}
