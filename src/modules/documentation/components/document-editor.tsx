"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { documentSections, lookTitle, type TextSection } from "@/shared/document-sections";
import { categoriesFor } from "@/shared/domain-categories";
import { ids, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { ResourceEditor } from "@/components/resource-editor";
import { RepeatableList } from "@/components/repeatable-list";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import { SectionFields } from "./section-fields";
export function DocumentEditor({
  kind,
  record,
  defaults = {},
  lockedProductionId,
  onClose,
  onSaved,
}: {
  kind: "looks" | "handovers" | "templates";
  record?: DomainRecord;
  defaults?: RecordData;
  lockedProductionId?: string;
  onClose: () => void;
  onSaved?: (record: DomainRecord) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const initial = { ...defaults, ...record?.data },
    scope = kind === "handovers" ? "handovers" : "looks";
  const [production, setProduction] = useState(
      lockedProductionId ?? value(initial, "productionId"),
    ),
    [actorId, setActorId] = useState(value(initial, "actorId")),
    [actorName, setActorName] = useState(value(initial, "actorName")),
    [characterId, setCharacterId] = useState(value(initial, "characterId")),
    [characterName, setCharacterName] = useState(value(initial, "characterName")),
    [actorFree, setActorFree] = useState(!!initial.actorName && !initial.actorId),
    [characterFree, setCharacterFree] = useState(!!initial.characterName && !initial.characterId),
    [title, setTitle] = useState(value(initial, "title")),
    [templateId, setTemplateId] = useState(value(initial, "templateId")),
    [duration, setDuration] = useState(
      initial.productionDurationMinutes == null ? "" : String(initial.productionDurationMinutes),
    ),
    [version, setVersion] = useState(Number(initial.version || 1)),
    [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(
      Array.isArray(initial.checklist)
        ? (initial.checklist as { text: string; done: boolean }[])
        : [],
    ),
    [creating, setCreating] = useState<"actors" | "characters" | null>(null),
    [categoriesOpen, setCategoriesOpen] = useState(false),
    [error, setError] = useState("");
  const [sections, setSections] = useState<TextSection[]>(() => {
    const old = documentSections(initial, scope);
    const choices = categoriesFor(scope, workspace.records.categories);
    const next = choices.map((category) => ({
      key: category.key,
      entries: old.find((section) => section.key === category.key)?.entries || [
        { id: crypto.randomUUID(), text: "" },
      ],
    }));
    for (const section of old)
      if (!next.some((row) => row.key === section.key) && section.entries.length)
        next.push(section);
    if (kind === "templates" && !initial.sections && ids(initial, "fields").length) {
      const custom = ids(initial, "fields").filter(
        (field) => !choices.some((category) => category.name.toLowerCase() === field.toLowerCase()),
      );
      if (custom.length) {
        let target = next.find((section) => section.key === "setup");
        if (!target) {
          target = { key: choices.at(-1)?.key || "setup", entries: [] };
          next.push(target);
        }
        target.entries.push(
          ...custom.map((label) => ({ id: crypto.randomUUID(), text: "", label })),
        );
      }
    }
    return next;
  });
  const selectedProduction = workspace.records.productions.find((row) => row.id === production);
  const changeTemplate = (id: string) => {
    setTemplateId(id);
    const template = workspace.records.templates.find((row) => row.id === id);
    if (!template) return;
    const incoming = documentSections(template.data, "looks");
    if (!template.data.sections) {
      const choices = categoriesFor("looks", workspace.records.categories);
      const custom = ids(template.data, "fields").filter(
        (field) => !choices.some((category) => category.name.toLowerCase() === field.toLowerCase()),
      );
      if (custom.length) {
        let target = incoming.find((section) => section.key === "setup");
        if (!target) {
          target = { key: "setup", entries: [] };
          incoming.push(target);
        }
        target.entries.push(
          ...custom.map((label) => ({ id: crypto.randomUUID(), label, text: "" })),
        );
      }
    }
    setSections((current) => {
      const next = current.map((section) => ({ ...section, entries: [...section.entries] }));
      for (const section of incoming) {
        let target = next.find((row) => row.key === section.key);
        if (!target) {
          target = { key: section.key, entries: [] };
          next.push(target);
        }
        for (const entry of section.entries) {
          if (
            !target.entries.some(
              (row) => (row.label || "") === (entry.label || "") && row.text === entry.text,
            )
          )
            target.entries.push({ ...entry, id: crypto.randomUUID() });
        }
      }
      return next;
    });
  };
  return (
    <>
      <Modal
        title={`${kind === "templates" ? "Vorlage" : kind === "handovers" ? "Dienstübergabe" : "Aufschrieb"} ${record ? "bearbeiten" : "anlegen"}`}
        onClose={onClose}
        wide
      >
        <form
          className="document-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              if (kind === "looks" && !(actorFree ? actorName.trim() : actorId))
                throw new Error(
                  "Bitte eine Schauspielperson auswählen oder ihren Namen eintragen.",
                );
              const data: RecordData =
                kind === "looks"
                  ? {
                      productionId: production,
                      actorId: actorFree ? "" : actorId,
                      actorName: actorFree ? actorName.trim() : "",
                      characterId: characterFree ? "" : characterId,
                      characterName: characterFree ? characterName.trim() : "",
                      templateId,
                      templateVersion: Number(
                        workspace.records.templates.find((row) => row.id === templateId)?.data
                          .version || 1,
                      ),
                      sections,
                      productionDurationMinutes: duration !== "" ? Number(duration) : null,
                      imageIds: ids(initial, "imageIds"),
                    }
                  : kind === "templates"
                    ? { title, version, sections, fields: ids(initial, "fields") }
                    : {
                        title,
                        productionId: "",
                        sections,
                        checklist: checklist.filter((item) => item.text.trim()),
                        imageIds: ids(initial, "imageIds"),
                      };
              if (kind === "looks") data.title = lookTitle(data, workspace.records.actors);
              const saved = await save(kind, data, record);
              onSaved?.(saved);
              onClose();
            } catch (exception) {
              setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
            }
          }}
        >
          {kind !== "looks" && (
            <label>
              {kind === "templates" ? "Vorlagenname" : "Übergabetitel"}
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          )}
          {kind === "looks" && (
            <>
              <div className="document-public-note">
                Aufschriebe sind für das freigegebene Team sichtbar. Ihr Titel ist der Name der
                Schauspielperson.
              </div>
              <div className="form-grid">
                <label>
                  Produktion
                  <select
                    disabled={
                      lockedProductionId !== undefined || (!!record && !!initial.productionId)
                    }
                    value={production}
                    onChange={(event) => {
                      setProduction(event.target.value);
                      setCharacterId("");
                    }}
                  >
                    <option value="">Allgemeiner Aufschrieb</option>
                    {workspace.records.productions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {value(row.data, "title")}
                        {row.data.status === "archived" ? " · Archiv" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vorlage (optional)
                  <select
                    value={templateId}
                    onChange={(event) => changeTemplate(event.target.value)}
                  >
                    <option value="">Ohne Vorlage</option>
                    {workspace.records.templates.map((row) => (
                      <option key={row.id} value={row.id}>
                        {value(row.data, "title")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                {(["actor", "character"] as const).map((key) => {
                  const actor = key === "actor",
                    free = actor ? actorFree : characterFree,
                    label = actor ? "Schauspielperson" : "Figur",
                    rows = actor
                      ? workspace.records.actors
                      : workspace.records.characters.filter(
                          (row) => value(row.data, "productionId") === production,
                        );
                  return (
                    <fieldset className="casting-choice" key={key}>
                      <legend>
                        {label}
                        {!actor ? " (optional)" : ""}
                      </legend>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={free}
                          onChange={(event) =>
                            (actor ? setActorFree : setCharacterFree)(event.target.checked)
                          }
                        />
                        Namen frei eintragen
                      </label>
                      {free ? (
                        <label>
                          {label} · Name
                          <input
                            required={actor}
                            maxLength={200}
                            value={actor ? actorName : characterName}
                            onChange={(event) =>
                              (actor ? setActorName : setCharacterName)(event.target.value)
                            }
                          />
                        </label>
                      ) : (
                        <>
                          <label>
                            {label} auswählen
                            <select
                              required={actor}
                              value={actor ? actorId : characterId}
                              onChange={(event) =>
                                (actor ? setActorId : setCharacterId)(event.target.value)
                              }
                            >
                              <option value="">{actor ? "Bitte auswählen" : "Keine Figur"}</option>
                              {rows.map((row) => (
                                <option key={row.id} value={row.id}>
                                  {value(row.data, "name")}
                                </option>
                              ))}
                            </select>
                          </label>
                          {workspace.user.role !== "user" && (
                            <Button
                              disabled={!actor && !production}
                              onClick={() => setCreating(actor ? "actors" : "characters")}
                            >
                              <Plus size={15} />
                              {label} direkt anlegen
                            </Button>
                          )}
                        </>
                      )}
                    </fieldset>
                  );
                })}
              </div>
              <label>
                Stückdauer (Minuten, optional abweichend)
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={duration}
                  placeholder={
                    selectedProduction?.data.durationMinutes
                      ? String(selectedProduction.data.durationMinutes)
                      : "Dauer der Produktion übernehmen"
                  }
                  onChange={(event) => setDuration(event.target.value)}
                />
              </label>
            </>
          )}
          {kind === "templates" && (
            <label>
              Vorlagenversion
              <input
                type="number"
                min={1}
                value={version}
                onChange={(event) => setVersion(Number(event.target.value))}
              />
            </label>
          )}
          <div className="document-section-heading">
            <h3>{kind === "templates" ? "Textfelder der Vorlage" : "Inhalte"}</h3>
            {workspace.user.role !== "user" && (
              <Button onClick={() => setCategoriesOpen(true)}>Abschnitte verwalten</Button>
            )}
          </div>
          <SectionFields kind={scope} sections={sections} onChange={setSections} />
          {kind === "handovers" && (
            <RepeatableList
              label="Checkliste"
              checklist
              items={checklist}
              onChange={(items) =>
                setChecklist(items.map((item) => ({ text: item.text, done: item.done === true })))
              }
            />
          )}
          {record && !!(initial.scene || initial.durationMinutes || initial.legacyProductionId) && (
            <p className="help-note">
              Historische Angaben bleiben gespeichert: {value(initial, "scene")}{" "}
              {initial.durationMinutes
                ? `· früherer Zeitbedarf ${initial.durationMinutes} Minuten`
                : ""}
              {initial.legacyProductionId ? " · frühere Produktionszuordnung" : ""}.
            </p>
          )}
          <p className="small muted">
            Weitere Bilder lassen sich nach dem Speichern in der Galerie hinzufügen.
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
      {categoriesOpen && <CategoryManager scope={scope} onClose={() => setCategoriesOpen(false)} />}{" "}
      {creating && (
        <ResourceEditor
          kind={creating}
          defaults={creating === "characters" ? { productionId: production } : {}}
          lockedProductionId={creating === "characters" ? production : undefined}
          onClose={() => setCreating(null)}
          onSaved={(saved) => {
            if (creating === "actors") {
              setActorId(saved.id);
              setActorFree(false);
            } else {
              setCharacterId(saved.id);
              setCharacterFree(false);
            }
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
