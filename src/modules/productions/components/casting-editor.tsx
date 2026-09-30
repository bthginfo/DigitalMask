"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { value, ids } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { ResourceEditor } from "@/components/resource-editor";
import { CastingImpact } from "@/components/casting-impact";
export function CastingEditor({
  record,
  defaults = {},
  lockedProductionId,
  onClose,
  onSaved,
}: {
  record?: DomainRecord;
  defaults?: RecordData;
  lockedProductionId?: string;
  onClose: () => void;
  onSaved?: (record: DomainRecord) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const initial = { ...defaults, ...record?.data };
  const [production, setProduction] = useState(
      lockedProductionId ?? value(initial, "productionId"),
    ),
    [actorId, setActorId] = useState(value(initial, "actorId")),
    [actorName, setActorName] = useState(value(initial, "actorName")),
    [characterId, setCharacterId] = useState(value(initial, "characterId")),
    [characterName, setCharacterName] = useState(value(initial, "characterName")),
    [actorFree, setActorFree] = useState(!!initial.actorName && !initial.actorId),
    [characterFree, setCharacterFree] = useState(!!initial.characterName && !initial.characterId),
    [alternate, setAlternate] = useState(initial.alternate === true),
    [notes, setNotes] = useState(value(initial, "notes")),
    [creating, setCreating] = useState<"actors" | "characters" | null>(null),
    [error, setError] = useState("");
  const data = {
    productionId: production,
    actorId: actorFree ? "" : actorId,
    actorName: actorFree ? actorName.trim() : "",
    characterId: characterFree ? "" : characterId,
    characterName: characterFree ? characterName.trim() : "",
    alternate,
    notes,
    imageIds: ids(record?.data || {}, "imageIds"),
  };
  return (
    <>
      <Modal title={`Besetzung ${record ? "bearbeiten" : "anlegen"}`} onClose={onClose} wide>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const saved = await save("casting", data, record);
              onSaved?.(saved);
              onClose();
            } catch (exception) {
              setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
            }
          }}
        >
          <label>
            Produktion
            <select
              required
              disabled={lockedProductionId !== undefined || !!record}
              value={production}
              onChange={(event) => {
                setProduction(event.target.value);
                setCharacterId("");
              }}
            >
              <option value="">Stück auswählen</option>
              {workspace.records.productions.map((row) => (
                <option key={row.id} value={row.id}>
                  {value(row.data, "title")}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            {(["character", "actor"] as const).map((kind) => {
              const figure = kind === "character",
                free = figure ? characterFree : actorFree,
                label = figure ? "Figur" : "Schauspielperson",
                rows = figure
                  ? workspace.records.characters.filter(
                      (row) => row.data.productionId === production,
                    )
                  : workspace.records.actors;
              return (
                <fieldset key={kind} className="casting-choice">
                  <legend>{label}</legend>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={free}
                      onChange={(event) =>
                        (figure ? setCharacterFree : setActorFree)(event.target.checked)
                      }
                    />
                    Namen frei eintragen
                  </label>
                  {free ? (
                    <label>
                      {label} · Name
                      <input
                        required
                        maxLength={200}
                        value={figure ? characterName : actorName}
                        onChange={(event) =>
                          (figure ? setCharacterName : setActorName)(event.target.value)
                        }
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        {label} auswählen
                        <select
                          required
                          value={figure ? characterId : actorId}
                          onChange={(event) =>
                            (figure ? setCharacterId : setActorId)(event.target.value)
                          }
                        >
                          <option value="">Bitte auswählen</option>
                          {rows.map((row) => (
                            <option key={row.id} value={row.id}>
                              {value(row.data, "name")}
                            </option>
                          ))}
                        </select>
                      </label>
                      {workspace.user.role !== "user" && (
                        <Button
                          disabled={figure && !production}
                          onClick={() => setCreating(figure ? "characters" : "actors")}
                        >
                          <Plus size={15} />
                          {figure ? "Figur" : "Schauspielperson"} direkt anlegen
                        </Button>
                      )}
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={alternate}
              onChange={(event) => setAlternate(event.target.checked)}
            />
            Alternierende Besetzung
          </label>
          <label>
            Hinweise
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {record && <CastingImpact previous={record} next={data} />}
          <p className="small muted">
            Fotos lassen sich nach dem Speichern in der Galerie ergänzen. Bestehende Bilder bleiben
            erhalten.
          </p>
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              Speichern
            </Button>
          </footer>
        </form>
      </Modal>
      {creating && (
        <ResourceEditor
          kind={creating}
          defaults={creating === "characters" ? { productionId: production } : {}}
          lockedProductionId={creating === "characters" ? production : undefined}
          onClose={() => setCreating(null)}
          onSaved={(saved) => {
            if (creating === "characters") {
              setCharacterId(saved.id);
              setCharacterFree(false);
            } else {
              setActorId(saved.id);
              setActorFree(false);
            }
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
