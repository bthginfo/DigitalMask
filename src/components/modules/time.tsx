"use client";
import { useMemo, useState } from "react";
import { useViewState } from "@/shared/view-state";
import { Plus, UploadCloud } from "lucide-react";
import { seasonForDate } from "@/shared/period-filter";
import { parseDurationInput } from "@/shared/duration-input";
import { categoriesFor } from "@/shared/domain-categories";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { instantDate, localDate, post, shiftDate, value, weekStart } from "@/shared/client-api";
import { useStoredValue } from "@/shared/client-storage";
import { isStaff } from "@/shared/client-members";
import { useWorkspace } from "../workspace-context";
import { ActionMenu, Button, ErrorMessage, ExportButton, Modal, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
export { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimerPanel } from "@/modules/time-tracking/components/work-timer";
import { TimeWorkspace } from "@/modules/time-tracking/components/time-workspace";
import { bookingDay, groupBookingWeeks, isoWeek } from "@/modules/time-tracking/history";
import { timeDayMarkers } from "@/modules/time-tracking/day-markers";
import { CalendarTimeProposals } from "@/modules/time-tracking/components/calendar-time-proposals";
import { WeekDayOverview } from "@/modules/time-tracking/components/week-day-overview";
import { DurationField } from "@/modules/time-tracking/components/duration-field";
import styles from "@/modules/time-tracking/components/time-history.module.css";
import weekStyles from "@/modules/time-tracking/components/week-view.module.css";
import { useConfirm } from "@/components/confirm-dialog";
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
  const confirm = useConfirm();
  const { workspace, reload, online } = useWorkspace();
  const scope = `time:${productionId || "all"}`;
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoryOptions = categoriesFor("time", workspace.records.categories);
  const [week, setWeek] = useViewState(workspace.user.id, scope, "week", weekStart());
  const [person, setPerson] = useViewState(
    workspace.user.id,
    scope,
    "person",
    workspace.user.role === "superadmin"
      ? workspace.members.find(isStaff)?.id || ""
      : workspace.user.id,
  );
  const [project, setProject] = useViewState(workspace.user.id, scope, "project", productionId);
  const [editor, setEditor] = useState("");
  const [editing, setEditing] = useState<DomainRecord | null>(null);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [draftModal, setDraftModal] = useState(false);
  const [draftDuration, setDraftDuration] = useState("");
  const [syncing, setSyncing] = useState(false);
  const admin = workspace.user.role !== "user";
  const allPeople = admin && !person;
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
      await reload(["time"]);
    });
    setSyncing(false);
  };
  const until = shiftDate(week, 6);
  const markers = useMemo(
    () =>
      allPeople
        ? []
        : timeDayMarkers({
            events: workspace.records.events,
            calendarCategories: workspace.records.calendarCategories,
            userId: person,
            from: week,
            to: until,
          }),
    [
      workspace.records.events,
      workspace.records.calendarCategories,
      person,
      week,
      until,
      allPeople,
    ],
  );
  const selected = useMemo(
    () =>
      groupBookingWeeks(workspace.records.time, {
        userId: allPeople ? undefined : person,
        productionId: project,
        markers,
      }).find((row) => row.start === week),
    [workspace.records.time, person, project, markers, allPeople, week],
  );
  const openBooking = () => setEditor(bookingDay(week));
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
  return (
    <>
      {embedded ? (
        <header className={styles.moduleHeading}>
          <h2>Produktionsstunden</h2>
          <div className={styles.moduleActions}>
            <ActionMenu>{secondaryActions}</ActionMenu>
            {workspace.user.role !== "superadmin" && (
              <Button variant="primary" onClick={openBooking}>
                <Plus size={16} /> Nachtragen
              </Button>
            )}
          </div>
        </header>
      ) : (
        <PageHeader
          eyebrow="PRODUKTIONSSTUNDEN"
          title="Produktionsstunden"
          description="Produktionsarbeit und allgemeine Tätigkeiten. Tages- und Wochensummen rechnen sich von selbst."
          compact
          secondaryActions={secondaryActions}
        >
          {workspace.user.role !== "superadmin" && (
            <Button variant="primary" onClick={openBooking}>
              <Plus size={16} />
              Nachtragen
            </Button>
          )}
        </PageHeader>
      )}
      {!embedded && (
        <div className={weekStyles.productionTimer}>
          <TimerPanel productionId={productionId} />
        </div>
      )}
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
            onClick={async () => {
              if (
                await confirm({
                  message: "Alle unzugeordneten Geräteentwürfe auf diesem Gerät verwerfen?",
                  confirmLabel: "Verwerfen",
                  destructive: true,
                })
              )
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
            onClick={async () => {
              if (
                await confirm({
                  message: `${drafts.length === 1 ? "Den lokalen Zeitentwurf" : `Alle ${drafts.length} lokalen Zeitentwürfe`} verwerfen?`,
                  confirmLabel: "Verwerfen",
                  destructive: true,
                })
              )
                persist([]);
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      {(admin || !productionId) && (
        <div className={styles.weekToolbar}>
          {admin && (
            <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Alle</option>
              {workspace.members.filter(isStaff).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.status !== "active" ? " · ehemaliges Teammitglied" : ""}
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
      )}
      <ErrorMessage message={error} />
      <WeekDayOverview
        key={`${person}:${project}:${week}`}
        kind="time"
        week={week}
        person={person}
        entries={selected?.entries || []}
        markers={selected?.markers || []}
        onWeekChange={setWeek}
        onEdit={setEditing}
        onDetail={setDetail}
        team={allPeople}
      >
        {!allPeople && (
          <CalendarTimeProposals
            kind="time"
            person={person}
            week={week}
            period={{}}
            productionId={project}
          />
        )}
      </WeekDayOverview>
      {editor && (
        <ResourceEditor
          kind="time"
          lockedProductionId={productionId || undefined}
          defaults={{ productionId: project, date: editor }}
          onSaved={(record) => {
            setPerson(workspace.user.id);
            setWeek(isoWeek(value(record.data, "date")).start);
          }}
          onClose={() => setEditor("")}
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
            // Week navigation replaces the season filter on screen; exports keep the season.
            season: seasonForDate(workspace.records.productions, instantDate(week)),
            ...(!allPeople ? { userId: person } : {}),
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
              let durationSeconds: number;
              try {
                durationSeconds = parseDurationInput(draftDuration, {
                  label: "Dauer",
                  required: true,
                });
              } catch (exception) {
                setError(exception instanceof Error ? exception.message : "Bitte prüfe die Dauer.");
                return;
              }
              const production = workspace.records.productions.find(
                (row) => row.id === (productionId || form.get("productionId")),
              );
              const category = String(form.get("category") || "");
              persist([
                ...drafts,
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  data: {
                    title:
                      String(form.get("title") || "").trim() ||
                      (production
                        ? value(production.data, "title")
                        : categoryOptions.find((option) => option.key === category)?.name ||
                          "Arbeitszeit"),
                    date: form.get("date"),
                    productionId: productionId || form.get("productionId"),
                    category,
                    durationSeconds,
                    pauseSeconds: 0,
                  },
                },
              ]);
              setDraftDuration("");
              setDraftModal(false);
            }}
          >
            <label>
              Tätigkeit (optional)
              <input name="title" maxLength={200} />
            </label>
            <div className="form-grid">
              <label>
                Datum
                <input name="date" type="date" defaultValue={localDate()} required />
              </label>
              <DurationField
                label="Dauer"
                value={draftDuration}
                onChange={setDraftDuration}
                options={{ label: "Dauer", required: true }}
              />
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
