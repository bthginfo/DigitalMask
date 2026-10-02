"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import styles from "./mask-plans.module.css";

export function NamePicker({
  legend,
  options,
  selected,
  names,
  onSelected,
  onNames,
  suggestions = [],
}: {
  legend: string;
  options: { id: string; name: string; historical?: boolean }[];
  selected: string[];
  names: string[];
  onSelected: (ids: string[]) => void;
  onNames: (names: string[]) => void;
  suggestions?: string[];
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const add = () => {
    const next = name.trim();
    if (!next) return;
    if (names.some((item) => item.toLocaleLowerCase("de") === next.toLocaleLowerCase("de"))) {
      setMessage("Dieser Name ist schon eingetragen.");
      return;
    }
    onNames([...names, next]);
    setName("");
    setMessage("");
  };
  return (
    <fieldset className={styles.picker}>
      <legend>{legend}</legend>
      {options.length ? (
        <div className={styles.choices}>
          {options.map((option) => (
            <label key={option.id} className={styles.choice}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={option.historical && !selected.includes(option.id)}
                onChange={(event) =>
                  onSelected(
                    event.target.checked
                      ? [...selected, option.id]
                      : selected.filter((item) => item !== option.id),
                  )
                }
              />
              <span>
                {option.name}
                {option.historical && <small>Frühere Zuordnung · entfernen möglich</small>}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className={styles.hint}>
          Noch keine Personen zur Auswahl. Du kannst Namen frei eintragen.
        </p>
      )}
      {names.length > 0 && (
        <ul className={styles.names} aria-label="Frei eingetragene Namen">
          {names.map((item, index) => (
            <li key={`${index}:${item}`}>
              <span>{item}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`${item} entfernen`}
                onClick={() => onNames(names.filter((_, position) => position !== index))}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.addName}>
        <label htmlFor={id}>
          Weiteren Namen frei eintragen
          <input
            id={id}
            value={name}
            maxLength={200}
            list={suggestions.length ? `${id}-suggestions` : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
        </label>
        <Button onClick={add} disabled={!name.trim()} title="Namen hinzufügen">
          <Plus size={16} />
          Hinzufügen
        </Button>
      </div>
      {suggestions.length > 0 && (
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      )}
      <p className={styles.hint} role="status">
        {message}
      </p>
    </fieldset>
  );
}
