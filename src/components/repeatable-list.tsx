"use client";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "./ui";
export function RepeatableList({
  label,
  items,
  onChange,
  checklist = false,
}: {
  label: string;
  items: { text: string; done?: boolean }[];
  onChange: (items: { text: string; done?: boolean }[]) => void;
  checklist?: boolean;
}) {
  const move = (index: number, offset: number) => {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return (
    <fieldset className="repeatable-list field-wide">
      <legend>{label}</legend>
      {items.map((item, index) => (
        <div key={index} className="repeatable-row">
          {checklist && (
            <input
              type="checkbox"
              aria-label={`Punkt ${index + 1} erledigt`}
              checked={item.done === true}
              onChange={(event) =>
                onChange(
                  items.map((entry, i) =>
                    i === index ? { ...entry, done: event.target.checked } : entry,
                  ),
                )
              }
            />
          )}
          <input
            aria-label={`${label} · Eintrag ${index + 1}`}
            value={item.text}
            maxLength={checklist ? 1000 : 100}
            onChange={(event) =>
              onChange(
                items.map((entry, i) =>
                  i === index ? { ...entry, text: event.target.value } : entry,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Eintrag ${index + 1} nach oben`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Eintrag ${index + 1} nach unten`}
            disabled={index === items.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Eintrag ${index + 1} entfernen`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <Button
        onClick={() => onChange([...items, { text: "", ...(checklist ? { done: false } : {}) }])}
      >
        <Plus size={15} />
        Eintrag hinzufügen
      </Button>
    </fieldset>
  );
}
