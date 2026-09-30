"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { TextSection } from "@/shared/document-sections";
import { sectionName } from "@/shared/document-sections";
import { categoriesFor } from "@/shared/domain-categories";
import { useWorkspace } from "@/components/workspace-context";
import { Button, Empty } from "@/components/ui";
export function SectionFields({
  kind,
  sections,
  onChange,
}: {
  kind: "looks" | "handovers";
  sections: TextSection[];
  onChange: (sections: TextSection[]) => void;
}) {
  const { workspace } = useWorkspace();
  const options = categoriesFor(kind, workspace.records.categories);
  const available = [
    ...options.map((option) => option.key),
    ...sections
      .map((section) => section.key)
      .filter((key) => !options.some((option) => option.key === key)),
  ];
  const update = (key: string, entries: TextSection["entries"]) =>
    onChange(
      sections.some((section) => section.key === key)
        ? sections.map((section) => (section.key === key ? { ...section, entries } : section))
        : [...sections, { key, entries }],
    );
  return (
    <div className="document-sections">
      {!available.length && (
        <Empty
          title="Noch keine Textabschnitte."
          description="Ein Admin kann passende Abschnittskategorien anlegen."
        />
      )}
      {available.map((key) => {
        const entries = sections.find((section) => section.key === key)?.entries || [];
        const move = (index: number, offset: number) => {
          const next = [...entries];
          [next[index], next[index + offset]] = [next[index + offset], next[index]];
          update(key, next);
        };
        return (
          <fieldset className="document-section" key={key}>
            <legend>{sectionName(key, kind, workspace.records.categories)}</legend>
            {entries.map((entry, index) => (
              <div className="document-text-entry" key={entry.id}>
                <div className="document-entry-header">
                  <label className="entry-label">
                    Kurzes Label (optional)
                    <input
                      value={entry.label || ""}
                      maxLength={200}
                      onChange={(event) =>
                        update(
                          key,
                          entries.map((row) =>
                            row.id === entry.id ? { ...row, label: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="document-entry-actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`${sectionName(key, kind, workspace.records.categories)} Feld ${index + 1} nach oben`}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === entries.length - 1}
                      aria-label={`${sectionName(key, kind, workspace.records.categories)} Feld ${index + 1} nach unten`}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${sectionName(key, kind, workspace.records.categories)} Feld ${index + 1} entfernen`}
                      onClick={() =>
                        update(
                          key,
                          entries.filter((row) => row.id !== entry.id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <label htmlFor={`section-${entry.id}`} className="visually-hidden">
                  {sectionName(key, kind, workspace.records.categories)} · Text {index + 1}
                </label>
                <textarea
                  id={`section-${entry.id}`}
                  rows={4}
                  value={entry.text}
                  maxLength={20000}
                  onChange={(event) =>
                    update(
                      key,
                      entries.map((row) =>
                        row.id === entry.id ? { ...row, text: event.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <Button
              onClick={() => update(key, [...entries, { id: crypto.randomUUID(), text: "" }])}
            >
              <Plus size={15} />
              {entries.length ? "Textfeld hinzufügen" : "Textfeld anlegen"}
            </Button>
          </fieldset>
        );
      })}
    </div>
  );
}
