"use client";
import { useState } from "react";
import Image from "next/image";
import {
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { DomainRecord, RecordData, RecordKind, Workspace } from "@/shared/contracts";
import { api, dateLabel, ids, localDate, num, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import { HistoryPanel } from "./history-panel";
import { fields, labels, statusLabels } from "./resource-fields";
import { useWorkspace } from "./workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal, PageHeader } from "./ui";
import { ResourceEditor } from "./resource-editor";
import { ExportDialog, ImportDialog } from "./export-dialog";

function recordTitle(record: DomainRecord, workspace: Workspace) {
  if (record.kind === "casting")
    return `${value(workspace.records.characters.find((row) => row.id === record.data.characterId)?.data || {}, "name") || "Figur"} · ${value(workspace.records.actors.find((row) => row.id === record.data.actorId)?.data || {}, "name") || "Schauspieler"}`;
  return value(record.data, "title") || value(record.data, "name") || labels[record.kind][1];
}

export function RecordDetail({ record, onClose }: { record: DomainRecord; onClose: () => void }) {
  const { workspace, save, remove, refresh, action, busy } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [subtask, setSubtask] = useState(false);
  const [timeBooking, setTimeBooking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const current = workspace.records[record.kind].find((x) => x.id === record.id) || record;
  const canEdit =
    workspace.user.role !== "user" ||
    (!["productions", "actors", "characters", "casting", "sprints", "events", "templates"].includes(
      current.kind,
    ) &&
      (!["time", "leave", "messages"].includes(current.kind) ||
        current.data.userId === workspace.user.id) &&
      (current.kind !== "tasks" ||
        current.createdBy === workspace.user.id ||
        ids(current.data, "assigneeIds").includes(workspace.user.id)) &&
      (current.kind !== "looks" || current.createdBy === workspace.user.id));
  const linkedFiles = workspace.records.files.filter(
    (x) => x.data.recordKind === current.kind && x.data.recordId === current.id,
  );
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
                else if (field.type === "date" || field.type === "datetime-local")
                  display = dateLabel(display, field.type === "datetime-local");
                else if (field.type === "checkbox")
                  display = current.data[field.key] ? "Ja" : "Nein";
                else if (field.type === "lines") display = ids(current.data, field.key).join(" · ");
                return (
                  <div key={field.key} className={field.type === "textarea" ? "field-wide" : ""}>
                    <dt>{field.label}</dt>
                    <dd>{display}</dd>
                  </div>
                );
              })}
          </dl>
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
                <h3>Bilder & Dateien</h3>
                {canEdit && (
                  <label className="button secondary">
                    <Upload size={15} />
                    {uploading ? "Wird hochgeladen …" : "Hochladen"}
                    <input
                      type="file"
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
                        <a
                          className="file-tile"
                          href={`/api/files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={24} />
                          <span>{value(file.data, "name")}</span>
                        </a>
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
            </section>
          )}
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
            {current.kind === "tasks" && (
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
            {current.kind === "looks" &&
              typeof current.data.templateFields === "object" &&
              current.data.templateFields !== null && (
                <dl className="detail-grid margin-top">
                  {Object.entries(current.data.templateFields as Record<string, string>).map(
                    ([key, content]) => (
                      <div className="field-wide" key={key}>
                        <dt>{key}</dt>
                        <dd>{content}</dd>
                      </div>
                    ),
                  )}
                </dl>
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
  const admin = workspace.user.role !== "user";
  const allowedCreate =
    canCreate !== false &&
    (admin ||
      ![
        "productions",
        "actors",
        "characters",
        "casting",
        "sprints",
        "events",
        "templates",
      ].includes(kind));
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
              const photo = workspace.records.files.find(
                (file) =>
                  file.data.recordId === row.id && value(file.data, "mime").startsWith("image/"),
              );
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
                        "Details, Bilder und Hinweise öffnen"}
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
                  <th>{kind === "materials" ? "Lagerort" : "Produktion / Kategorie"}</th>
                  <th>{kind === "materials" ? "Bestand" : "Status / Datum"}</th>
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
                        {kind === "materials"
                          ? value(row.data, "location")
                          : production
                            ? value(production.data, "title")
                            : statusLabels[value(row.data, "category")] || "–"}
                      </td>
                      <td>
                        {kind === "materials" ? (
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
