"use client";
import { useMemo, useState } from "react";
import { Check, Plus, UploadCloud } from "lucide-react";
import { PeriodPicker, periodExportFilters, weekForPeriod } from "@/components/period-picker";
import { dateMatchesPeriod, initialPeriod, type PeriodFilter } from "@/shared/period-filter";
import { categoriesFor } from "@/shared/domain-categories";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  localDate,
  post,
  shiftDate,
  value,
  weekStart,
} from "@/shared/client-api";
import { useStoredValue } from "@/shared/client-storage";
import { isStaff } from "@/shared/client-members";
import { useWorkspace } from "../workspace-context";
import { ActionMenu, Badge, Button, ErrorMessage, ExportButton, Modal, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
import { statusLabels } from "../resource-fields";
export { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimeWorkspace } from "@/modules/time-tracking/components/time-workspace";
import { groupBookingWeeks, isoWeek, periodForWeek } from "@/modules/time-tracking/history";
import { timeDayMarkers } from "@/modules/time-tracking/day-markers";
import {
  BookingList,
  WeekNavigator,
  WeeklyHistory,
} from "@/modules/time-tracking/components/weekly-bookings";
import { CalendarTimeProposals } from "@/modules/time-tracking/components/calendar-time-proposals";
import { WeekDayOverview } from "@/modules/time-tracking/components/week-day-overview";
import styles from "@/modules/time-tracking/components/time-history.module.css";
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
  const [period, setPeriod] = useState<PeriodFilter>(() =>
    initialPeriod(workspace.records.productions, productionId),
  );
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
  const markers = useMemo(() => {
    const first =
      workspace.records.events
        .map((event) => value(event.data, "start").slice(0, 10))
        .filter(Boolean)
        .sort()[0] || week;
    return timeDayMarkers({
      events: workspace.records.events,
      calendarCategories: workspace.records.calendarCategories,
      userId: person,
      from: first,
      to: until > shiftDate(weekStart(), 6) ? until : shiftDate(weekStart(), 6),
      period,
    });
  }, [workspace.records.events, workspace.records.calendarCategories, person, week, until, period]);
  const weeks = useMemo(
    () =>
      groupBookingWeeks(workspace.records.time, {
        userId: person,
        productionId: project,
        period,
        markers,
      }),
    [workspace.records.time, person, project, period, markers],
  );
  const selected = weeks.find((row) => row.start === week);
  const entries = selected?.entries || [];
  const total = selected?.seconds || 0;
  const selectWeek = (next: string) => {
    setWeek(next);
    setPeriod(periodForWeek(period, next, workspace.records.productions));
  };
  const secondaryActions = (
    <>
      <ExportButton onClick={() => setExporting(true)} />
      {admin && (
        <Button onClick={() => setCategoriesOpen(true)}>Tätigkeitsbereiche verwalten</Button>
      )}
      {workspace.user.role !== "superadmin" && !online && (
        <Button onClick={() => setDraftModal(true)}>Ohne Internet vormerken</Button>
      )}
    </>
  );
  const sheets = workspace.records.timesheets.filter(
    (x) => admin || x.data.userId === workspace.user.id,
  );
  return (
    <>
      {embedded ? (
        <header className={styles.moduleHeading}>
          <h2>Produktions- / Arbeitszeiten</h2>
          <div className={styles.moduleActions}>
            <ActionMenu>{secondaryActions}</ActionMenu>
            {workspace.user.role !== "superadmin" && (
              <Button variant="primary" onClick={() => setEditor(true)}>
                <Plus size={16} /> Nachtragen
              </Button>
            )}
          </div>
        </header>
      ) : (
        <PageHeader
          eyebrow="PRODUKTIONS- / ARBEITSZEITEN"
          title={embedded ? "Deine Tätigkeiten" : "Produktionszeiten"}
          description="Produktionsarbeit und allgemeine Tätigkeiten. Tages- und Wochensummen rechnen sich von selbst."
          compact
          secondaryActions={secondaryActions}
        >
          {workspace.user.role !== "superadmin" && (
            <Button variant="primary" onClick={() => setEditor(true)}>
              <Plus size={16} />
              Zeit nachtragen
            </Button>
          )}
        </PageHeader>
      )}
      <div
        className={`time-layout ${styles.workLayout} ${embedded ? "embedded-work-summary" : ""}`}
      >
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
                .flatMap((entry) => entry.allocations)
                .filter((day) => day.date === date && dateMatchesPeriod(day.date, period))
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
        compact
        records={workspace.records.time}
        productions={workspace.records.productions}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setWeek(weekForPeriod(workspace.records.time, person, next, week));
        }}
      />
      <div className={styles.weekToolbar}>
        <WeekNavigator week={week} onChange={selectWeek} />
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
        <section className={styles.currentWeek} aria-label="Arbeitszeit der ausgewählten Woche">
          <header className={styles.currentHeading}>
            <h3>
              KW {isoWeek(week).number} · {isoWeek(week).year}
            </h3>
            <strong>{hours(total)} h</strong>
          </header>
          <BookingList entries={entries} kind="time" onEdit={setEditing} onDetail={setDetail} />
        </section>
      ) : (
        <section className={styles.emptyWeek}>
          <h3>Noch keine Arbeitszeit in dieser Woche.</h3>
          <p>
            Frühere Buchungen findest du im Wochenverlauf. Allgemeine Arbeit wie Besprechung oder
            Aufräumen lässt sich ohne Produktion buchen.
          </p>
          {workspace.user.role !== "superadmin" && (
            <Button onClick={() => setEditor(true)}>Zeit nachtragen</Button>
          )}
        </section>
      )}
      <WeekDayOverview
        week={week}
        person={person}
        entries={entries}
        markers={selected?.markers || []}
        onDetail={setDetail}
      />
      <WeeklyHistory
        key={`${person}:${project}:${period.year || ""}:${period.season || ""}`}
        weeks={weeks}
        selectedWeek={week}
        person={person}
        kind="time"
        filtered={!!period.year || !!period.season}
        onAllSeasons={() => setPeriod({})}
        onSelectWeek={selectWeek}
        onEdit={setEditing}
        onDetail={setDetail}
      />
      <CalendarTimeProposals
        kind="time"
        person={person}
        week={week}
        period={period}
        productionId={project}
      />
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
          defaults={{ productionId: project, date: week }}
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
