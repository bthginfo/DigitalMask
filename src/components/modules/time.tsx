"use client";
import { useMemo, useState } from "react";
import { Check, Pencil, Plus, UploadCloud } from "lucide-react";
import { PeriodPicker, periodExportFilters, weekForPeriod } from "@/components/period-picker";
import { recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { categoriesFor, categoryName } from "@/shared/domain-categories";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  instantDate,
  localDate,
  num,
  post,
  shiftDate,
  timeAllocations,
  value,
  weekStart,
} from "@/shared/client-api";
import { useStoredValue } from "@/shared/client-storage";
import { isStaff } from "@/shared/client-members";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
import { statusLabels } from "../resource-fields";
export { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimeWorkspace } from "@/modules/time-tracking/components/time-workspace";
type Draft = { id: string; data: RecordData; createdAt: string };
export function TimeModule({ productionId = "" }: { productionId?: string }) {
  return productionId ? <WorkTimeModule productionId={productionId} /> : <TimeWorkspace />;
}
export function WorkTimeModule({
  productionId = "",
  embedded = false,
}: {
  productionId?: string;
  embedded?: boolean;
}) {
  const { workspace, action, refresh, online, busy } = useWorkspace();
  const [period, setPeriod] = useState<PeriodFilter>({});
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoryOptions = categoriesFor("time", workspace.records.categories);
  const [week, setWeek] = useState(weekStart());
  const [person, setPerson] = useState(
    workspace.user.role === "superadmin"
      ? workspace.members.find(isStaff)?.id || ""
      : workspace.user.id,
  );
  const [project, setProject] = useState(productionId);
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<DomainRecord | null>(null);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [draftModal, setDraftModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const admin = workspace.user.role !== "user";
  const key = `digitalmask-time-drafts:${workspace.user.id}`;
  const [draftJson, setDraftJson] = useStoredValue(key, "[]");
  const drafts = useMemo<Draft[]>(() => {
    try {
      return JSON.parse(draftJson);
    } catch {
      return [];
    }
  }, [draftJson]);
  const [inboxJson, setInboxJson] = useStoredValue("digitalmask-offline-inbox", "[]");
  const inbox = useMemo<Draft[]>(() => {
    try {
      const parsed = JSON.parse(inboxJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [inboxJson]);
  const persist = (next: Draft[]) => setDraftJson(JSON.stringify(next));
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };
  const sync = async () => {
    setSyncing(true);
    await run(async () => {
      let remaining = [...drafts];
      for (const draft of drafts) {
        await post("/api/records/time", { data: { ...draft.data, idempotencyKey: draft.id } });
        remaining = remaining.filter((x) => x.id !== draft.id);
        persist(remaining);
      }
      await refresh();
    });
    setSyncing(false);
  };
  const until = shiftDate(week, 6);
  const entries = workspace.records.time
    .filter(
      (x) =>
        value(x.data, "userId") === person &&
        recordMatchesPeriod(x, period, workspace.records.productions) &&
        timeAllocations(x.data).some((day) => day.date >= week && day.date <= until) &&
        (!project || x.data.productionId === project),
    )
    .sort((a, b) => value(b.data, "date").localeCompare(value(a.data, "date")));
  const total = entries
    .flatMap((x) => timeAllocations(x.data))
    .filter(
      (day) =>
        day.date >= week &&
        day.date <= until &&
        (!period.year || Number(day.date.slice(0, 4)) === period.year),
    )
    .reduce((sum, day) => sum + day.seconds, 0);
  const sheets = workspace.records.timesheets.filter(
    (x) => admin || x.data.userId === workspace.user.id,
  );
  return (
    <>
      <PageHeader
        eyebrow="PRODUKTIONS- / ARBEITSZEITEN"
        title={embedded ? "Deine Tätigkeiten" : "Produktionszeiten"}
        description="Produktionsarbeit und allgemeine Tätigkeiten. Tages- und Wochensummen rechnen sich von selbst."
      >
        <ExportButton onClick={() => setExporting(true)} />
        {admin && (
          <Button onClick={() => setCategoriesOpen(true)}>Tätigkeitsbereiche verwalten</Button>
        )}
        {workspace.user.role !== "superadmin" && (
          <Button onClick={() => setDraftModal(true)}>Offlineentwurf</Button>
        )}
        {workspace.user.role !== "superadmin" && (
          <Button variant="primary" onClick={() => setEditor(true)}>
            <Plus size={16} />
            Zeit nachtragen
          </Button>
        )}
      </PageHeader>
      <div className={`time-layout ${embedded ? "embedded-work-summary" : ""}`}>
        {!embedded && <TimerPanel productionId={productionId} />}
        <section className="time-summary">
          <p className="eyebrow">{productionId ? "DEINE PRODUKTIONSWOCHE" : "DEINE WOCHE"}</p>
          <strong>
            {hours(total)} <span>Stunden</span>
          </strong>
          <div className="week-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const date = shiftDate(week, i);
              const seconds = entries
                .flatMap((x) => timeAllocations(x.data))
                .filter(
                  (day) =>
                    day.date === date &&
                    (!period.year || Number(day.date.slice(0, 4)) === period.year),
                )
                .reduce((sum, day) => sum + day.seconds, 0);
              return (
                <div key={date}>
                  <span className="small">{hours(seconds)}h</span>
                  <div className="bar-track">
                    <span style={{ height: `${Math.min(100, (seconds / (8 * 3600)) * 100)}%` }} />
                  </div>
                  <span className="small muted">
                    {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}
                  </span>
                </div>
              );
            })}
          </div>
          {!productionId && (
            <Button
              disabled={busy || !entries.length || person !== workspace.user.id}
              onClick={() => void run(() => action("timesheet-submit", undefined, { week }))}
            >
              <Check size={16} />
              Woche zur Freigabe einreichen
            </Button>
          )}
        </section>
      </div>
      {workspace.user.role !== "superadmin" && inbox.length > 0 && (
        <div className="offline-banner">
          <div>
            <strong>{inbox.length} unzugeordnete Geräteentwürfe</strong>
            <p className="small">
              Diese Offlinebuchungen gehören noch zu keinem Account. Übernimm nur deine eigenen
              Tätigkeiten als {workspace.user.name}.
            </p>
          </div>
          <Button
            onClick={() => {
              persist([
                ...drafts,
                ...inbox.filter((item) => !drafts.some((draft) => draft.id === item.id)),
              ]);
              setInboxJson("[]");
            }}
          >
            In meinen Account übernehmen
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Alle unzugeordneten Geräteentwürfe auf diesem Gerät verwerfen?"))
                setInboxJson("[]");
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      {workspace.user.role !== "superadmin" && drafts.length > 0 && (
        <div className="offline-banner">
          <div>
            <strong>{drafts.length} lokale Zeitentwürfe</strong>
            <p className="small">
              Nur auf diesem Gerät gespeichert. Bitte synchronisieren, bevor du dich abmeldest.
            </p>
          </div>
          <Button disabled={!online || syncing} onClick={() => void sync()}>
            <UploadCloud size={16} />
            {syncing ? "Synchronisiert …" : "Jetzt synchronisieren"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Alle lokalen Zeitentwürfe verwerfen?")) persist([]);
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      <PeriodPicker
        records={workspace.records.time}
        productions={workspace.records.productions}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setWeek(weekForPeriod(workspace.records.time, person, next, week));
        }}
      />
      <div className="toolbar wrap">
        <label className="inline-label">
          Woche ab
          <input
            type="date"
            value={week}
            onChange={(e) => {
              if (e.target.value) {
                setWeek(weekStart(instantDate(e.target.value)));
                if (period.year) setPeriod({ ...period, year: Number(e.target.value.slice(0, 4)) });
              }
            }}
          />
        </label>
        {admin && (
          <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
            {workspace.members.filter(isStaff).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Produktion"
          disabled={!!productionId}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">Alle Tätigkeiten</option>
          {workspace.records.productions.map((x) => (
            <option key={x.id} value={x.id}>
              {value(x.data, "title")}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={error} />
      {entries.length ? (
        <div className="table-scroll panel">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tätigkeit</th>
                <th>Produktion</th>
                <th>Dauer</th>
                <th>Pause</th>
                <th>Bearbeiten</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td>{dateLabel(value(row.data, "date"))}</td>
                  <td>
                    <button className="text-button strong" onClick={() => setDetail(row)}>
                      {value(row.data, "title")}
                    </button>
                    <span className="small muted">
                      {categoryName(
                        "time",
                        value(row.data, "category"),
                        workspace.records.categories,
                      )}
                    </span>
                  </td>
                  <td>
                    {(workspace.records.productions.find((x) => x.id === row.data.productionId)
                      ?.data.title as string) || "Allgemein"}
                  </td>
                  <td className="strong">{hours(num(row.data, "durationSeconds"))} h</td>
                  <td>{Math.round(num(row.data, "pauseSeconds") / 60)} min</td>
                  <td>
                    <Button variant="ghost" onClick={() => setEditing(row)}>
                      <Pencil size={15} /> Bearbeiten
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Wochensumme</td>
                <td colSpan={3}>{hours(total)} h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty
          title="Noch keine Zeit in dieser Woche."
          description="Starte den Timer oder trage eine Tätigkeit nach. Du kannst auch ohne Produktion Büro- und Aufräumzeit buchen."
          action={workspace.user.role !== "superadmin" ? "Zeit buchen" : undefined}
          onAction={() => setEditor(true)}
        />
      )}
      {!productionId && (
        <section className="panel margin-top">
          <header className="panel-heading">
            <h2>{admin ? "Wochenfreigaben im Team" : "Meine Wochenfreigaben"}</h2>
          </header>
          {!sheets.length ? (
            <p className="empty-inline">Noch keine Wochen eingereicht.</p>
          ) : (
            <div className="list">
              {sheets.map((sheet) => (
                <div className="list-row" key={sheet.id}>
                  <div>
                    <strong>
                      {workspace.members.find((x) => x.id === sheet.data.userId)?.name}
                    </strong>
                    <p className="small muted">
                      Woche ab {dateLabel(value(sheet.data, "week"))} · {value(sheet.data, "note")}
                    </p>
                  </div>
                  <Badge tone={sheet.data.status === "approved" ? "green" : "neutral"}>
                    {statusLabels[value(sheet.data, "status")]}
                  </Badge>
                  {admin && (
                    <>
                      {sheet.data.status !== "approved" && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              action("timesheet-decide", sheet.id, {
                                status: "approved",
                                version: sheet.version,
                              }),
                            )
                          }
                        >
                          Freigeben
                        </Button>
                      )}
                      <Button
                        disabled={busy}
                        onClick={() => {
                          const note = prompt("Welche Korrektur wird benötigt?");
                          if (note)
                            void run(() =>
                              action("timesheet-decide", sheet.id, {
                                status: "changes_requested",
                                note,
                              }),
                            );
                        }}
                      >
                        Korrektur
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {editor && (
        <ResourceEditor
          kind="time"
          lockedProductionId={productionId || undefined}
          defaults={{ productionId: project }}
          onClose={() => setEditor(false)}
        />
      )}
      {editing && (
        <ResourceEditor
          kind="time"
          record={workspace.records.time.find((row) => row.id === editing.id) || editing}
          onClose={() => setEditing(null)}
        />
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {exporting && (
        <ExportDialog
          kind="time"
          filters={{
            ...periodExportFilters(period),
            userId: person,
            from: week,
            to: until,
            ...(project ? { productionId: project } : {}),
          }}
          onClose={() => setExporting(false)}
        />
      )}
      {categoriesOpen && <CategoryManager scope="time" onClose={() => setCategoriesOpen(false)} />}
      {draftModal && (
        <Modal title="Zeit offline als Entwurf speichern" onClose={() => setDraftModal(false)}>
          <p className="muted">
            Dieser Entwurf bleibt nur in deinem Browser. Er wird erst nach deiner ausdrücklichen
            Synchronisierung im Theater gespeichert.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              persist([
                ...drafts,
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  data: {
                    title: form.get("title"),
                    date: form.get("date"),
                    productionId: productionId || form.get("productionId"),
                    category: form.get("category"),
                    durationSeconds: Number(form.get("minutes")) * 60,
                    pauseSeconds: 0,
                  },
                },
              ]);
              setDraftModal(false);
            }}
          >
            <label>
              Tätigkeit
              <input name="title" required />
            </label>
            <div className="form-grid">
              <label>
                Datum
                <input name="date" type="date" defaultValue={localDate()} required />
              </label>
              <label>
                Minuten
                <input name="minutes" type="number" min="1" required />
              </label>
              <label>
                Produktion
                <select name="productionId" defaultValue={productionId} disabled={!!productionId}>
                  <option value="">Allgemein</option>
                  {workspace.records.productions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {value(x.data, "title")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kategorie
                <select name="category" required>
                  {!categoryOptions.length && <option value="">Keine Kategorien vorhanden</option>}
                  {categoryOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <footer className="dialog-footer">
              <Button onClick={() => setDraftModal(false)}>Abbrechen</Button>
              <Button type="submit" variant="primary">
                Lokal speichern
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
