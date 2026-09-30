"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { categoriesFor, type CategoryScope } from "@/shared/domain-categories";
import { value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, Empty, ErrorMessage, Modal } from "@/components/ui";
const scopes = {
  time: "Tätigkeitsbereiche",
  materials: "Funduskategorien",
  looks: "Aufschriebabschnitte",
  handovers: "Übergabeabschnitte",
};
export function CategoryManager({ scope, onClose }: { scope: CategoryScope; onClose: () => void }) {
  const { workspace, remove, busy } = useWorkspace();
  const [editing, setEditing] = useState<DomainRecord | "new" | null>(null),
    [error, setError] = useState("");
  const rows = (workspace.records.categories || []).filter((row) => row.data.scope === scope);
  return (
    <>
      {!editing && (
        <Modal title={`${scopes[scope]} verwalten`} onClose={onClose}>
          <p className="muted">
            Bezeichnungen, Reihenfolge und Farben für euren Arbeitsalltag. Verwendete Kategorien
            bleiben geschützt.
          </p>
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus size={15} />
            Kategorie anlegen
          </Button>
          <ErrorMessage message={error} />
          <div className="category-manager-list">
            {rows
              .sort((a, b) => Number(a.data.order) - Number(b.data.order))
              .map((row) => (
                <article key={row.id}>
                  <span
                    className="category-color"
                    style={{ background: value(row.data, "color") }}
                  />
                  <div>
                    <strong>{value(row.data, "name")}</strong>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`${value(row.data, "name")} bearbeiten`}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`${value(row.data, "name")} löschen`}
                    onClick={() => {
                      if (confirm("Ungenutzte Kategorie löschen?"))
                        void remove(row).catch((exception) => setError(exception.message));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
          </div>
          {!rows.length && (
            <Empty
              title="Noch keine Kategorien."
              description="Lege die erste passende Bezeichnung an."
            />
          )}
        </Modal>
      )}
      {editing && (
        <CategoryEditor
          scope={scope}
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function CategoryEditor({
  scope,
  record,
  onClose,
}: {
  scope: CategoryScope;
  record?: DomainRecord;
  onClose: () => void;
}) {
  const { save, busy } = useWorkspace();
  const [name, setName] = useState(value(record?.data || {}, "name")),
    [color, setColor] = useState(value(record?.data || {}, "color") || "#377a68"),
    [order, setOrder] = useState(Number(record?.data.order || 0)),
    [error, setError] = useState("");
  return (
    <Modal title={`Kategorie ${record ? "bearbeiten" : "anlegen"}`} onClose={onClose}>
      <form
        className="category-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              "categories",
              {
                scope,
                key: record ? record.data.key : `category-${crypto.randomUUID()}`,
                name: name.trim(),
                color,
                order,
              },
              record,
            );
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <label>
          Bezeichnung
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Farbe
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label>
          Reihenfolge
          <input
            type="number"
            min={0}
            max={10000}
            value={order}
            onChange={(event) => setOrder(Number(event.target.value))}
          />
        </label>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Speichern
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export { categoriesFor };
