"use client";
import { useState } from "react";
import Image from "next/image";
import { Image as ImageIcon, MoreHorizontal, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { DomainRecord, RecordData, RecordKind, Workspace } from "@/shared/contracts";
import { api, dateLabel, hours, ids, localDate, num, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import { HistoryPanel } from "./history-panel";
import { fields, labels, statusLabels } from "./resource-fields";
import { useWorkspace } from "./workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal, PageHeader } from "./ui";
import { ResourceEditor } from "./resource-editor";
import { DocumentContent } from "@/modules/documentation/components/document-content";
import { lookTitle } from "@/shared/document-sections";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import { categoryName } from "@/shared/domain-categories";
import { EventDetail } from "@/modules/calendar/components/event-detail";
import { canManageRecord } from "@/shared/record-permissions";
import { ExportDialog, ImportDialog } from "./export-dialog";
import { DocumentAttachment } from "@/modules/documents/components/document-attachment";
import { documentAccept, RecordDocuments } from "@/modules/documents/components/record-documents";

function recordTitle(record: DomainRecord, workspace: Workspace) {
  if (record.kind === "looks") return lookTitle(record.data, workspace.records.actors);
  if (record.kind === "casting")
    return `${value(workspace.records.characters.find((row) => row.id === record.data.characterId)?.data || {}, "name") || value(record.data, "characterName") || "Figur"} · ${value(workspace.records.actors.find((row) => row.id === record.data.actorId)?.data || {}, "name") || value(record.data, "actorName") || "Schauspieler"}`;
  return value(record.data, "title") || value(record.data, "name") || labels[record.kind][1];
}

export function RecordDetail({ record, onClose }: { record: DomainRecord; onClose: () => void }) {
  if (record.kind === "events") return <EventDetail record={record} onClose={onClose} />;
  return <GenericRecordDetail record={record} onClose={onClose} />;
}
function GenericRecordDetail({ record, onClose }: { record: DomainRecord; onClose: () => void }) {
  const { workspace, save, remove, refresh, action, busy } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [subtask, setSubtask] = useState(false);
  const [timeBooking, setTimeBooking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [figureOpen, setFigureOpen] = useState(false);
  const current = workspace.records[record.kind].find((x) => x.id === record.id) || record;
  const canEdit = canManageRecord(workspace.user, current.kind, current);
  const linkedFiles = workspace.records.files.filter(
    (x) => x.data.recordKind === current.kind && x.data.recordId === current.id,
  );
  const linkedFigure =
    current.kind === "casting"
      ? workspace.records.characters.find((row) => row.id === current.data.characterId)
      : undefined;
  const figureFiles = linkedFigure
    ? workspace.records.files.filter(
        (row) => row.data.recordKind === "characters" && row.data.recordId === linkedFigure.id,
      )
    : [];
  const title = recordTitle(current, workspace);
  const attempt = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };
  const deleteRecord = () => {
    if (window.confirm(`„${title}“ wirklich löschen? Verknüpfte Einträge können betroffen sein.`))
      void attempt(async () => {
        await remove(current);
        onClose();
      });
  };
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    await attempt(async () => {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", await prepareUpload(file));
        form.append("recordKind", current.kind);
        form.append("recordId", current.id);
        await api<DomainRecord>("/api/files", { method: "POST", body: form });
      }
      await refresh();
    });
    setUploading(false);
  };
  const checklist = Array.isArray(current.data.checklist)
    ? (current.data.checklist as { text: string; done: boolean }[])
    : [];
  return (
    <>
      {editing ? (
        <ResourceEditor kind={current.kind} record={current} onClose={() => setEditing(false)} />
      ) : (
        <Modal title={title} onClose={onClose} wide>
          <div className="detail-actions">
            {!["looks", "handovers"].includes(current.kind) && (
              <Badge
                tone={
                  value(current.data, "status") === "published" ||
                  value(current.data, "status") === "done"
                    ? "green"
                    : "neutral"
                }
              >
                {statusLabels[value(current.data, "status")] || labels[current.kind][1]}
              </Badge>
            )}
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil size={15} />
                Bearbeiten
              </Button>
            )}
            {![
              "files",
              "leave",
              "sprints",
              "templates",
              "characters",
              "notifications",
              "timesheets",
              "messages",
            ].includes(current.kind) && <ExportButton onClick={() => setExporting(true)} />}
            {canEdit && (
              <Button variant="danger-ghost" disabled={busy} onClick={deleteRecord}>
                <Trash2 size={15} />
                Löschen
              </Button>
            )}
          </div>
          <dl className="detail-grid">
            {(fields[current.kind] || [])
              .filter(
                (field) =>
                  !["title", "name", "checklist", "imageIds"].includes(field.key) &&
                  current.data[field.key] !== undefined &&
                  current.data[field.key] !== "",
              )
              .map((field) => {
                let display = String(current.data[field.key]);
                if (field.source) {
                  const rows =
                    field.source === "members"
                      ? workspace.members.map((x) => ({ id: x.id, name: x.name }))
                      : workspace.records[field.source].map((x) => ({
                          id: x.id,
                          name: value(x.data, "title") || value(x.data, "name"),
                        }));
                  const selected =
                    field.type === "multi"
                      ? ids(current.data, field.key)
                      : [value(current.data, field.key)];
                  display = selected
                    .map((id) => rows.find((x) => x.id === id)?.name || "–")
                    .join(", ");
                } else if (field.options)
                  display =
                    field.options.find((x) => x[0] === current.data[field.key])?.[1] || display;
                else if (field.key === "durationSeconds")
                  display = `${hours(num(current.data, field.key))} h`;
                else if (field.key === "pauseSeconds")
                  display = `${Math.round(num(current.data, field.key) / 60)} min`;
                else if (field.type === "date" || field.type === "datetime-local")
                  display = dateLabel(display, field.type === "datetime-local");
                else if (field.type === "checkbox")
                  display = current.data[field.key] ? "Ja" : "Nein";
                else if (field.type === "lines") display = ids(current.data, field.key).join(" · ");
                if (
                  field.key === "category" &&
                  (current.kind === "time" || current.kind === "materials")
                )
                  display = categoryName(
                    current.kind,
                    value(current.data, "category"),
                    workspace.records.categories,
                  );
                return (
                  <div key={field.key} className={field.type === "textarea" ? "field-wide" : ""}>
                    <dt>{field.label}</dt>
                    <dd>{display}</dd>
                  </div>
                );
              })}
          </dl>
          {current.kind === "actors" &&
            (value(current.data, "biography") || value(current.data, "sourceUrl")) && (
              <section className="detail-section actor-ensemble-detail">
                <header className="panel-heading">
                  <h3>Aus dem Ensemble</h3>
                  {value(current.data, "ensembleStatus") && (
                    <Badge>{value(current.data, "ensembleStatus")}</Badge>
                  )}
                </header>
                {value(current.data, "biography") && (
                  <p className="actor-biography">{value(current.data, "biography")}</p>
                )}
                {ids(current.data, "ensembleProductions").length > 0 && (
                  <>
                    <h4>Aktuelle Produktionen</h4>
                    <ul>
                      {ids(current.data, "ensembleProductions").map((name, index) => (
                        <li key={`${name}-${index}`}>{name}</li>
                      ))}
                    </ul>
                  </>
                )}
                {/^https:\/\/theater\.ingolstadt\.de\//.test(value(current.data, "sourceUrl")) && (
                  <a
                    className="text-button"
                    href={value(current.data, "sourceUrl")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Profil beim Stadttheater Ingolstadt öffnen ↗
                  </a>
                )}
              </section>
            )}
          {["looks", "handovers", "templates"].includes(current.kind) && (
            <DocumentContent record={current} />
          )}
          {checklist.length > 0 && (
            <section className="detail-section">
              <h3>Checkliste</h3>
              {checklist.map((item, i) => (
                <label className="check-label checklist-item" key={i}>
                  <input
                    type="checkbox"
                    disabled={busy || !canEdit}
                    checked={item.done}
                    onChange={(event) =>
                      void attempt(() =>
                        save(
                          current.kind,
                          {
                            checklist: checklist.map((x, j) =>
                              j === i ? { ...x, done: event.target.checked } : x,
                            ),
                          },
                          current,
                        ),
                      )
                    }
                  />
                  <span className={item.done ? "done" : ""}>{item.text}</span>
                </label>
              ))}
            </section>
          )}
          {current.kind === "tasks" && (
            <section className="detail-section">
              <h3>Unteraufgaben</h3>
              {workspace.records.tasks
                .filter((x) => x.data.parentId === current.id)
                .map((x) => (
                  <p key={x.id}>
                    {value(x.data, "title")} <Badge>{statusLabels[value(x.data, "status")]}</Badge>
                  </p>
                ))}
              <Button onClick={() => setSubtask(true)}>
                <Plus size={15} />
                Unteraufgabe anlegen
              </Button>
            </section>
          )}
          {current.kind === "productions" && canEdit && (
            <div className="detail-actions">
              <Button
                disabled={busy}
                onClick={() => {
                  const title = prompt(
                    "Titel der Wiederaufnahme",
                    `${value(current.data, "title")} · Wiederaufnahme`,
                  );
                  if (title)
                    void attempt(async () => {
                      await action("production-copy", current.id, { title });
                      onClose();
                    });
                }}
              >
                Als Wiederaufnahme kopieren
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void attempt(() =>
                    save(
                      "productions",
                      { status: current.data.status === "archived" ? "active" : "archived" },
                      current,
                    ),
                  )
                }
              >
                {current.data.status === "archived" ? "Reaktivieren" : "Archivieren"}
              </Button>
            </div>
          )}
          {[
            "looks",
            "characters",
            "casting",
            "actors",
            "handovers",
            "materials",
            "messages",
          ].includes(current.kind) && (
            <section className="detail-section">
              <header className="panel-heading">
                <h3>
                  {current.kind === "casting" ? "Bilder dieser Besetzung" : "Bilder & Dateien"}
                </h3>
                {canEdit && (
                  <label className="button secondary">
                    <Upload size={15} />
                    {uploading
                      ? "Wird hochgeladen …"
                      : current.kind === "casting"
                        ? "Bilder hinzufügen"
                        : "Hochladen"}
                    <input
                      type="file"
                      accept={current.kind === "casting" ? ".jpg,.jpeg,.png,.webp" : documentAccept}
                      multiple
                      className="visually-hidden"
                      disabled={uploading}
                      onChange={(event) => void upload(event.target.files)}
                    />
                  </label>
                )}
              </header>
              {linkedFiles.length ? (
                <div className="gallery">
                  {linkedFiles.map((file) => (
                    <div key={file.id} className="gallery-item">
                      {value(file.data, "mime").startsWith("image/") ? (
                        <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">
                          <Image
                            unoptimized
                            width={1800}
                            height={1800}
                            src={`/api/files/${file.id}`}
                            alt={value(file.data, "name")}
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <DocumentAttachment file={file} />
                      )}
                      <div className="gallery-caption">
                        <span>{value(file.data, "name")}</span>
                        {canEdit && (
                          <button
                            className="icon-button"
                            title="Datei löschen"
                            aria-label={`${value(file.data, "name")} löschen`}
                            onClick={() => {
                              if (confirm("Datei löschen?"))
                                void attempt(async () => {
                                  await api(`/api/files/${file.id}`, { method: "DELETE" });
                                  await refresh();
                                });
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small muted">
                  <ImageIcon size={15} /> Noch keine Bilder oder Anhänge. Lade Fotos direkt vom
                  Smartphone hoch.
                </p>
              )}
              {current.kind === "actors" && value(current.data, "portraitCredit") && (
                <p className="small muted">
                  Ensemble-Porträt: {value(current.data, "portraitCredit")}
                </p>
              )}
            </section>
          )}
          {linkedFigure && (
            <section className="detail-section">
              <header className="panel-heading">
                <h3>Figur: {value(linkedFigure.data, "name")}</h3>
                <Button onClick={() => setFigureOpen(true)}>
                  <Pencil size={15} />
                  Figur öffnen
                </Button>
              </header>
              {value(linkedFigure.data, "description") && (
                <p>{value(linkedFigure.data, "description")}</p>
              )}
              {figureFiles.length > 0 && (
                <>
                  <p className="small muted">Vorhandene Bilder der Figur</p>
                  <div className="gallery">
                    {figureFiles.map((file) => (
                      <div className="gallery-item" key={file.id}>
                        {value(file.data, "mime").startsWith("image/") ? (
                          <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">
                            <Image
                              unoptimized
                              width={1800}
                              height={1800}
                              src={`/api/files/${file.id}`}
                              alt={value(file.data, "name")}
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <DocumentAttachment file={file} />
                        )}
                        <div className="gallery-caption">
                          <span>{value(file.data, "name")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
          {["tasks", "templates"].includes(current.kind) && <RecordDocuments record={current} />}
          {current.kind === "materials" && (
            <section className="qr-section">
              <Image
                unoptimized
                src={`/api/qr?kind=materials&id=${current.id}`}
                alt={`QR-Code für ${title}`}
                width={160}
                height={160}
              />
              <div>
                <h3>Direkt zum Fundus-Eintrag</h3>
                <p className="muted small">
                  QR-Code an der Materialbox oder Perücke anbringen. Der Zugriff erfordert einen
                  aktiven Theaterzugang.
                </p>
                <a
                  className="button secondary"
                  href={`/api/qr?kind=materials&id=${current.id}`}
                  download={`${title}-qr.svg`}
                >
                  QR herunterladen
                </a>
              </div>
            </section>
          )}
          <>
            {current.kind === "tasks" && workspace.user.role !== "superadmin" && (
              <div className="detail-actions margin-top">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void attempt(() =>
                      action("timer-start", undefined, {
                        title: value(current.data, "title"),
                        productionId: value(current.data, "productionId"),
                        taskId: current.id,
                        category: current.data.productionId ? "production" : "other",
                      }),
                    )
                  }
                >
                  Timer für diese Aufgabe starten
                </Button>
                <Button onClick={() => setTimeBooking(true)}>Zeit nachtragen</Button>
              </div>
            )}
            {current.kind === "events" && (
              <div className="detail-actions margin-top">
                <Button onClick={() => setTimeBooking(true)}>
                  Tatsächliche Arbeitszeit buchen
                </Button>
                <p className="small muted">
                  Ein geplanter Dienst wird erst durch deine Buchung zur tatsächlichen Arbeitszeit.
                </p>
              </div>
            )}
            {(current.kind === "looks" || current.kind === "templates") && (
              <HistoryPanel record={current} />
            )}
          </>
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            <span className="small muted">
              Letzte Änderung {dateLabel(current.updatedAt, true)}
            </span>
            <Button onClick={onClose}>Schließen</Button>
          </footer>
        </Modal>
      )}
      {figureOpen && linkedFigure && (
        <RecordDetail record={linkedFigure} onClose={() => setFigureOpen(false)} />
      )}
      {timeBooking && (
        <ResourceEditor
          kind="time"
          defaults={{
            title: value(current.data, "title"),
            productionId: value(current.data, "productionId"),
            category: current.data.productionId ? "production" : "other",
            ...(current.kind === "tasks"
              ? { taskId: current.id }
              : current.kind === "events"
                ? {
                    start: value(current.data, "start"),
                    end: value(current.data, "end"),
                    date: localDate(new Date(value(current.data, "start"))),
                  }
                : {}),
          }}
          onClose={() => setTimeBooking(false)}
        />
      )}
      {subtask && (
        <ResourceEditor
          kind="tasks"
          lockedProductionId={value(current.data, "productionId")}
          defaults={{
            parentId: current.id,
            productionId: current.data.productionId,
            sprintId: current.data.sprintId,
          }}
          onClose={() => setSubtask(false)}
        />
      )}
      {exporting && (
        <ExportDialog
          kind={current.kind}
          filters={{ id: current.id }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}

export function ResourceView({
  kind,
  title,
  description,
  defaults = {},
  filter,
  children,
  headerActions,
  canCreate,
  initialRecord,
  lockedProductionId,
}: {
  kind: RecordKind;
  title?: string;
  description?: string;
  defaults?: RecordData;
  filter?: (record: DomainRecord) => boolean;
  children?: React.ReactNode;
  headerActions?: React.ReactNode;
  canCreate?: boolean;
  initialRecord?: string;
  lockedProductionId?: string;
}) {
  const { workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(false);
  const [detail, setDetail] = useState<DomainRecord | null>(
    initialRecord ? workspace.records[kind].find((x) => x.id === initialRecord) || null : null,
  );
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [low, setLow] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const admin = workspace.user.role !== "user";
  const allowedCreate = canCreate !== false && canManageRecord(workspace.user, kind);
  const rows = workspace.records[kind].filter(
    (row) =>
      (!filter || filter(row)) &&
      (!search || JSON.stringify(row.data).toLowerCase().includes(search.toLowerCase())) &&
      (!low || num(row.data, "quantity") <= num(row.data, "minQuantity")),
  );
  const exportable = [
    "productions",
    "actors",
    "casting",
    "tasks",
    "time",
    "events",
    "looks",
    "materials",
    "handovers",
  ].includes(kind);
  return (
    <>
      <PageHeader
        eyebrow="DEIN GEMEINSAMER ARBEITSRAUM"
        title={title || labels[kind][0]}
        description={description}
      >
        <>
          {headerActions}
          {(kind === "materials" || kind === "handovers") && admin && (
            <Button onClick={() => setCategoriesOpen(true)}>Kategorien verwalten</Button>
          )}
          {exportable && <ExportButton onClick={() => setExporting(true)} />}
          {admin && lockedProductionId === undefined && (
            <Button onClick={() => setImporting(true)}>
              <Upload size={16} />
              Importieren
            </Button>
          )}
          {allowedCreate && (
            <Button variant="primary" onClick={() => setEditor(true)}>
              <Plus size={16} />
              {labels[kind][1]} anlegen
            </Button>
          )}
        </>
      </PageHeader>
      {children}
      <div className="toolbar">
        <input
          className="search-input"
          aria-label={`${labels[kind][0]} durchsuchen`}
          placeholder={`${labels[kind][0]} durchsuchen …`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="small muted">{rows.length} Einträge</span>
        {kind === "materials" && (
          <label className="check-label">
            <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />
            Nur Einkaufsbedarf
          </label>
        )}
      </div>
      {rows.length ? (
        ["looks", "actors", "characters", "casting"].includes(kind) ? (
          <div className="editorial-grid">
            {rows.map((row) => {
              const displayName = recordTitle(row, workspace);
              const photo =
                (kind === "actors"
                  ? workspace.records.files.find(
                      (file) =>
                        file.id === row.data.portraitFileId &&
                        file.data.recordId === row.id &&
                        value(file.data, "mime").startsWith("image/"),
                    )
                  : undefined) ||
                workspace.records.files.find(
                  (file) =>
                    file.data.recordId === row.id && value(file.data, "mime").startsWith("image/"),
                ) ||
                (kind === "casting"
                  ? workspace.records.files.find(
                      (file) =>
                        file.data.recordKind === "characters" &&
                        file.data.recordId === row.data.characterId &&
                        value(file.data, "mime").startsWith("image/"),
                    )
                  : undefined);
              const imageCount =
                kind === "casting"
                  ? workspace.records.files.filter(
                      (file) =>
                        file.data.recordId === row.id &&
                        value(file.data, "mime").startsWith("image/"),
                    ).length
                  : 0;
              return (
                <button
                  key={row.id}
                  aria-label={`${displayName} · Details und Galerie öffnen`}
                  className="editorial-card"
                  onClick={() => setDetail(row)}
                >
                  {photo ? (
                    <Image
                      unoptimized
                      width={1800}
                      height={1800}
                      className="editorial-image"
                      src={`/api/files/${photo.id}`}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="editorial-placeholder">
                      <span>{displayName.slice(0, 2).toUpperCase()}</span>
                      <span className="small">{labels[kind][1]}</span>
                    </div>
                  )}
                  <div className="editorial-body">
                    <p className="eyebrow">
                      {value(row.data, "scene") || value(row.data, "hair") || "MASKE"}
                    </p>
                    <h3>{displayName}</h3>
                    <p className="small muted">
                      {value(row.data, "preparation") ||
                        value(row.data, "notes") ||
                        (kind === "casting"
                          ? "Bilder hinzufügen und Besetzung öffnen"
                          : "Details, Bilder und Hinweise öffnen")}
                    </p>
                    <Badge tone={row.data.status === "published" ? "green" : "neutral"}>
                      {kind === "casting"
                        ? row.data.alternate
                          ? "Alternierende Besetzung"
                          : "Besetzung"
                        : statusLabels[value(row.data, "status")] ||
                          value(row.data, "wigSize") ||
                          "Katalog"}
                    </Badge>
                    {kind === "casting" && (
                      <span className="casting-image-hint">
                        <ImageIcon size={14} />
                        {imageCount
                          ? `${imageCount} ${imageCount === 1 ? "Bild" : "Bilder"}`
                          : "Bilder hinzufügen"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="table-scroll panel">
            <table>
              <thead>
                <tr>
                  <th>{kind === "casting" ? "Figur / Schauspieler" : "Bezeichnung"}</th>
                  <th>
                    {kind === "materials"
                      ? "Lagerort"
                      : kind === "handovers"
                        ? "Checkliste"
                        : "Produktion / Kategorie"}
                  </th>
                  <th>
                    {kind === "materials"
                      ? "Bestand"
                      : kind === "handovers"
                        ? "Zuletzt geändert"
                        : "Status / Datum"}
                  </th>
                  <th>
                    <span className="visually-hidden">Öffnen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const figure = workspace.records.characters.find(
                    (x) => x.id === row.data.characterId,
                  );
                  const actor = workspace.records.actors.find((x) => x.id === row.data.actorId);
                  const production = workspace.records.productions.find(
                    (x) => x.id === row.data.productionId,
                  );
                  return (
                    <tr key={row.id}>
                      <td>
                        <button className="text-button strong" onClick={() => setDetail(row)}>
                          {value(row.data, "title") ||
                            value(row.data, "name") ||
                            `${figure ? value(figure.data, "name") : "Figur"} · ${actor ? value(actor.data, "name") : "Schauspieler"}`}
                        </button>
                        {row.data.alternate === true && (
                          <span className="small muted">Alternierende Besetzung</span>
                        )}
                      </td>
                      <td>
                        {kind === "handovers"
                          ? Array.isArray(row.data.checklist) && row.data.checklist.length
                            ? `${(row.data.checklist as { done: boolean }[]).filter((item) => item.done).length} / ${row.data.checklist.length} erledigt`
                            : "Keine Checkliste"
                          : kind === "materials"
                            ? value(row.data, "location")
                            : production
                              ? value(production.data, "title")
                              : statusLabels[value(row.data, "category")] || "–"}
                      </td>
                      <td>
                        {kind === "handovers" ? (
                          dateLabel(row.updatedAt)
                        ) : kind === "materials" ? (
                          <Badge
                            tone={
                              num(row.data, "quantity") <= num(row.data, "minQuantity")
                                ? "coral"
                                : "green"
                            }
                          >
                            {num(row.data, "quantity")} / min. {num(row.data, "minQuantity")}
                          </Badge>
                        ) : (
                          <Badge
                            tone={
                              ["active", "complete", "published"].includes(
                                value(row.data, "status"),
                              )
                                ? "green"
                                : "neutral"
                            }
                          >
                            {statusLabels[value(row.data, "status")] ||
                              dateLabel(
                                value(row.data, "date") ||
                                  value(row.data, "start") ||
                                  row.updatedAt,
                              )}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label="Details öffnen"
                          onClick={() => setDetail(row)}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Empty
          title={search ? "Keine passenden Einträge" : `Hier beginnen eure ${labels[kind][0]}.`}
          description={
            search
              ? "Versuche einen anderen Suchbegriff oder passe die Filter an."
              : description ||
                "Lege den ersten Eintrag an. Alle freigegebenen Informationen sind dann für euer Team an einem Ort erreichbar."
          }
          action={allowedCreate ? `${labels[kind][1]} anlegen` : undefined}
          onAction={() => setEditor(true)}
        />
      )}
      {categoriesOpen && (
        <CategoryManager
          scope={kind === "handovers" ? "handovers" : "materials"}
          onClose={() => setCategoriesOpen(false)}
        />
      )}
      {editor && (
        <ResourceEditor
          kind={kind}
          defaults={defaults}
          lockedProductionId={lockedProductionId}
          onClose={() => setEditor(false)}
          onSaved={(saved) => {
            if (["characters", "casting", "looks", "actors"].includes(kind)) setDetail(saved);
          }}
        />
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {exporting && (
        <ExportDialog
          kind={kind}
          filters={
            typeof defaults.productionId === "string" ? { productionId: defaults.productionId } : {}
          }
          onClose={() => setExporting(false)}
        />
      )}
      {importing && <ImportDialog kind={kind} onClose={() => setImporting(false)} />}
    </>
  );
}
