"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { calendarCategoryBehavior } from "@/shared/calendar-categories";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal } from "@/components/ui";
function CategoryEditor({ record, onClose }: { record?: DomainRecord; onClose: () => void }) {
  const { save, busy } = useWorkspace();
  const [name, setName] = useState(value(record?.data || {}, "name"));
  const [color, setColor] = useState(value(record?.data || {}, "color") || "#377a68");
  const [allDay, setAllDay] = useState(record?.data.allDay === true);
  const [error, setError] = useState("");
  return (
    <Modal title={`Kalenderart ${record ? "bearbeiten" : "anlegen"}`} onClose={onClose}>
      <form
        className="category-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              "calendarCategories",
              {
                key: record ? value(record.data, "key") : `category-${crypto.randomUUID()}`,
                name: name.trim(),
                color,
                allDay,
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
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Farbe
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
          />
          Ganztägig ohne Uhrzeiten
        </label>
        <p className="small muted">
          Bei bereits verwendeten Arten bleiben der Zeitmodus und bestehende Termine erhalten. Name
          und Farbe lassen sich ändern, solange die Bedeutung erhalten bleibt.
        </p>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            Speichern
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export function CalendarCategoriesDialog({ onClose }: { onClose: () => void }) {
  const { workspace, remove, busy } = useWorkspace();
  const [editing, setEditing] = useState<DomainRecord | "new" | null>(null);
  const [error, setError] = useState("");
  const records = workspace.records.calendarCategories || [];
  return (
    <>
      {!editing && (
        <Modal title="Kalenderarten verwalten" onClose={onClose}>
          <p className="muted">
            Eigene Dienste, Proben und freie Tage mit passenden Namen und Farben.
          </p>
          <div className="category-manager-heading">
            <span className="small muted">{records.length} Kalenderarten</span>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={15} />
              Kalenderart anlegen
            </Button>
          </div>
          <ErrorMessage message={error} />
          {records.length ? (
            <div className="category-manager-list">
              {records.map((record) => (
                <article key={record.id}>
                  <span
                    className="category-color"
                    style={{ background: value(record.data, "color") }}
                  />
                  <div>
                    <strong>{value(record.data, "name")}</strong>
                    <Badge>
                      {record.data.allDay ? "Ganztägig" : "Mit Uhrzeiten"}
                      {calendarCategoryBehavior(value(record.data, "key"), record.data)
                        .background === "service"
                        ? " · Arbeitszeit"
                        : calendarCategoryBehavior(value(record.data, "key"), record.data)
                              .background === "hint"
                          ? " · Hinweis"
                          : ""}
                    </Badge>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`${value(record.data, "name")} bearbeiten`}
                    onClick={() => setEditing(record)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${value(record.data, "name")} löschen`}
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          `Kalenderart „${value(record.data, "name")}“ löschen? Bereits verwendete Arten können nicht gelöscht werden.`,
                        )
                      ) {
                        setError("");
                        void remove(record).catch((exception) =>
                          setError(
                            exception instanceof Error
                              ? exception.message
                              : "Löschen fehlgeschlagen",
                          ),
                        );
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Noch keine Kalenderarten."
              description="Lege eure erste Art an, um Dienste oder ganztägige Termine zu planen."
            />
          )}
          <footer className="dialog-footer">
            <Button onClick={onClose}>Schließen</Button>
          </footer>
        </Modal>
      )}
      {editing && (
        <CategoryEditor
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
