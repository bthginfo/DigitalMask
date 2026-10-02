"use client";
import { useState, type FormEvent } from "react";
import {
  contactsValue,
  type DomainRecord,
  type RecordData,
  type RecordKind,
} from "@/shared/contracts";
import { ids, instantDate, localDate, localDateTime, num, value } from "@/shared/client-api";
import { fields, labels, type Field } from "./resource-fields";
import { useWorkspace } from "./workspace-context";
import { Button, ErrorMessage, Modal } from "./ui";
import { ProductionPeopleFields } from "./production-people";
import { isActiveStaff } from "@/shared/client-members";
import { TimeBookingEditor } from "@/modules/time-tracking/components/time-booking-editor";
import { EventEditor } from "@/modules/calendar/components/event-editor";
import { PersonEditor } from "@/modules/people/components";
import { DocumentEditor } from "@/modules/documentation/components/document-editor";
import { CastingEditor } from "@/modules/productions/components/casting-editor";
import { RepeatableList } from "./repeatable-list";
import { categoriesFor } from "@/shared/domain-categories";
import { CastingImpact } from "./casting-impact";
import { numberDraft, parseNumberDraft } from "@/shared/number-draft";

function initialData(kind: RecordKind): RecordData {
  return {
    status:
      kind === "productions"
        ? "preparation"
        : kind === "looks"
          ? "draft"
          : kind === "tasks"
            ? "todo"
            : kind === "sprints"
              ? "planned"
              : kind === "leave"
                ? "pending"
                : "open",
    priority: "normal",
    category: kind === "time" ? "production" : kind === "events" ? "service" : "other",
    recurrence: "none",
    color: "#16735c",
    date: localDate(),
    version: 1,
    quantity: 1,
    minQuantity: 0,
    pauseSeconds: 0,
    durationSeconds: 1800,
    ...(kind === "templates"
      ? { fields: ["Vorbereitung", "Material", "Arbeitsablauf", "Umbau"] }
      : {}),
  };
}
type ResourceEditorProps = {
  kind: RecordKind;
  record?: DomainRecord;
  defaults?: RecordData;
  onClose: () => void;
  lockedProductionId?: string;
  onSaved?: (record: DomainRecord) => void;
};
export function ResourceEditor(props: ResourceEditorProps) {
  if (props.kind === "people") return <PersonEditor {...props} />;
  if (props.kind === "casting") return <CastingEditor {...props} />;
  if (props.kind === "looks" || props.kind === "handovers" || props.kind === "templates")
    return <DocumentEditor {...props} kind={props.kind} />;
  if (props.kind === "events") return <EventEditor {...props} />;
  if (props.kind === "time" || props.kind === "attendance")
    return <TimeBookingEditor {...props} kind={props.kind} />;
  return <GenericResourceEditor {...props} />;
}
function GenericResourceEditor({
  kind,
  record,
  defaults = {},
  onClose,
  lockedProductionId,
  onSaved,
}: {
  kind: RecordKind;
  record?: DomainRecord;
  defaults?: RecordData;
  onClose: () => void;
  lockedProductionId?: string;
  onSaved?: (record: DomainRecord) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const [data, setData] = useState<RecordData>({
    ...initialData(kind),
    ...(kind === "tasks"
      ? { assigneeIds: workspace.user.role === "superadmin" ? [] : [workspace.user.id] }
      : {}),
    ...(kind === "materials"
      ? { category: categoriesFor("materials", workspace.records.categories)[0]?.key || "" }
      : {}),
    ...defaults,
    ...record?.data,
  });
  const productionContext =
    lockedProductionId ??
    (record && ["tasks", "sprints", "characters", "casting", "looks", "handovers"].includes(kind)
      ? value(record.data, "productionId")
      : undefined);
  const [error, setError] = useState("");
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const change = (key: string, next: unknown) =>
    setData((current) => ({ ...current, [key]: next }));
  const configuredFields = fields[kind] || [];
  const selectedTemplate = workspace.records.templates.find(
    (template) => template.id === data.templateId,
  );
  const customFields = selectedTemplate
    ? ids(selectedTemplate.data, "fields").filter(
        (name) =>
          ![
            "vorbereitung",
            "material",
            "materialien",
            "arbeitsablauf",
            "umbau",
            "wechsel",
          ].includes(name.toLowerCase().trim()),
      )
    : [];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result: RecordData = {
        ...data,
        ...(productionContext !== undefined ? { productionId: productionContext } : {}),
      };
      for (const field of configuredFields.filter((field) => field.type === "number")) {
        const factor =
          kind === "time" && ["durationSeconds", "pauseSeconds"].includes(field.key) ? 60 : 1;
        const raw =
          numberDrafts[field.key] ??
          numberDraft(data[field.key] === undefined ? 0 : Number(data[field.key]) / factor);
        result[field.key] =
          parseNumberDraft(raw, {
            label: field.label,
            required: field.required,
            fallback: 0,
            min: field.min,
          })! * factor;
      }
      if (kind === "tasks" && productionContext === "") result.sprintId = "";
      if (Array.isArray(result.checklist))
        result.checklist = (result.checklist as { text: string; done: boolean }[]).filter((item) =>
          item.text.trim(),
        );
      for (const key of ["fields", "exceptions"])
        if (Array.isArray(result[key]))
          result[key] = (result[key] as string[]).map((item) => item.trim()).filter(Boolean);
      if (kind === "time") {
        if (result.start && result.end) {
          const diff =
            (instantDate(String(result.end)).getTime() -
              instantDate(String(result.start)).getTime()) /
              1000 -
            Number(result.pauseSeconds || 0);
          if (diff <= 0)
            throw new Error(
              "Das Ende muss nach dem Beginn liegen und die Pause kleiner als die Gesamtdauer sein.",
            );
          result.durationSeconds = diff;
        }
      }
      if (kind === "looks") {
        const template = workspace.records.templates.find((x) => x.id === result.templateId);
        result.templateVersion = template ? num(template.data, "version") : 1;
        result.imageIds = result.imageIds || [];
      }
      for (const field of configuredFields)
        if (field.type === "datetime-local" && result[field.key])
          result[field.key] = instantDate(String(result[field.key])).toISOString();
      const saved = await save(kind, result, record);
      onClose();
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };
  const render = (field: Field) => {
    if (field.key === "productionId" && productionContext !== undefined)
      return (
        <div className="locked-production-field" key={field.key}>
          <span className="small muted">Arbeitsraum</span>
          <strong>
            {productionContext
              ? value(
                  workspace.records.productions.find((row) => row.id === productionContext)?.data ||
                    {},
                  "title",
                )
              : "Teamboard · ohne Produktion"}
          </strong>
        </div>
      );
    if (field.key === "sprintId" && productionContext === "") return null;
    if (kind === "productions" && field.key === "memberIds") return null;
    const options =
      (field.key === "category" && (kind === "materials" || kind === "time")
        ? categoriesFor(kind, workspace.records.categories).map(
            (option) => [option.key, option.name] as [string, string],
          )
        : field.options) ||
      (field.source === "members"
        ? workspace.members
            .filter((x) => isActiveStaff(x) || ids(data, field.key).includes(x.id))
            .map(
              (x) =>
                [
                  x.id,
                  `${x.name}${isActiveStaff(x) ? "" : " · historische Zuordnung (entfernen)"}`,
                ] as [string, string],
            )
        : field.source
          ? workspace.records[field.source]
              .filter(
                (x) =>
                  x.id !== record?.id &&
                  (!["characters", "sprints", "tasks"].includes(field.source!) ||
                    value(x.data, "productionId") === value(data, "productionId")),
              )
              .map(
                (x) => [x.id, value(x.data, "title") || value(x.data, "name")] as [string, string],
              )
          : []);
    if (field.type === "lines" || field.type === "checklist")
      return (
        <RepeatableList
          key={field.key}
          label={field.label.replace(/\s*\(.*\)/, "")}
          checklist={field.type === "checklist"}
          items={
            field.type === "checklist"
              ? Array.isArray(data[field.key])
                ? (data[field.key] as { text: string; done: boolean }[])
                : []
              : ids(data, field.key).map((text) => ({ text }))
          }
          onChange={(items) =>
            change(field.key, field.type === "checklist" ? items : items.map((item) => item.text))
          }
        />
      );
    if (field.type === "multi")
      return (
        <fieldset className="form-multi" key={field.key}>
          <legend>{field.label}</legend>
          {!options.length && <p className="muted small">Noch keine Einträge verfügbar.</p>}
          {options.map(([id, label]) => (
            <label className="check-label" key={id}>
              <input
                type="checkbox"
                checked={ids(data, field.key).includes(id)}
                onChange={(event) =>
                  change(
                    field.key,
                    event.target.checked
                      ? [...ids(data, field.key), id]
                      : ids(data, field.key).filter((x) => x !== id),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      );
    if (field.type === "checkbox")
      return (
        <label className="check-label" key={field.key}>
          <input
            type="checkbox"
            checked={!!data[field.key]}
            onChange={(event) => change(field.key, event.target.checked)}
          />
          {field.label}
        </label>
      );
    const val =
      field.type === "number"
        ? (numberDrafts[field.key] ??
          numberDraft(
            Number(data[field.key] || 0) /
              (kind === "time" && ["durationSeconds", "pauseSeconds"].includes(field.key) ? 60 : 1),
          ))
        : field.type === "datetime-local" && data[field.key]
          ? localDateTime(String(data[field.key]))
          : value(data, field.key);
    return (
      <label key={field.key} className={field.type === "textarea" ? "field-wide" : ""}>
        {field.label}
        {field.required && <span className="required"> *</span>}
        {field.type === "select" ? (
          <select
            required={field.required}
            value={String(val)}
            onChange={(event) => change(field.key, event.target.value)}
          >
            {!field.options && <option value="">Bitte auswählen</option>}
            {options.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            rows={4}
            required={field.required}
            placeholder={field.placeholder}
            value={String(val)}
            onChange={(event) => change(field.key, event.target.value)}
          />
        ) : (
          <input
            type={field.type || "text"}
            required={field.required}
            min={field.min}
            step={field.type === "number" ? "any" : undefined}
            placeholder={field.placeholder}
            value={val}
            onChange={(event) =>
              field.type === "number"
                ? setNumberDrafts((current) => ({ ...current, [field.key]: event.target.value }))
                : change(field.key, event.target.value)
            }
          />
        )}
      </label>
    );
  };
  return (
    <Modal title={`${labels[kind][1]} ${record ? "bearbeiten" : "anlegen"}`} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          {configuredFields.map(render)}
          {kind === "productions" && (
            <ProductionPeopleFields
              contacts={contactsValue(data.contacts)}
              memberIds={ids(data, "memberIds")}
              onChange={(contacts, memberIds) =>
                setData((current) => ({ ...current, contacts, memberIds }))
              }
            />
          )}
          {kind === "casting" && record && <CastingImpact previous={record} next={data} />}
          {kind === "looks" &&
            customFields.map((name) => (
              <label className="field-wide" key={name}>
                {name}
                <textarea
                  rows={3}
                  value={
                    typeof data.templateFields === "object" && data.templateFields
                      ? String((data.templateFields as Record<string, string>)[name] || "")
                      : ""
                  }
                  onChange={(event) =>
                    change("templateFields", {
                      ...(typeof data.templateFields === "object" ? data.templateFields : {}),
                      [name]: event.target.value,
                    })
                  }
                />
              </label>
            ))}
        </div>
        {!record && ["characters", "casting", "looks", "actors"].includes(kind) && (
          <p className="small muted">
            Nach dem Speichern öffnet sich die Galerie. Dort kannst du mehrere Bilder hochladen,
            auch direkt vom Smartphone.
          </p>
        )}
        {kind === "time" && (
          <p className="small muted">
            Mit Beginn und Ende wird die Arbeitsdauer abzüglich Pause automatisch berechnet. Ohne
            Zeitraum kannst du direkt Minuten buchen.
          </p>
        )}
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
