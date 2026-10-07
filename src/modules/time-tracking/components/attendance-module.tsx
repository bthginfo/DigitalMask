"use client";
import { useMemo, useState } from "react";
import { useViewState } from "@/shared/view-state";
import { DoorOpen, Plus, UploadCloud } from "lucide-react";
import { PeriodPicker, periodExportFilters, weekForPeriod } from "@/components/period-picker";
import { seasonForDate, type PeriodFilter } from "@/shared/period-filter";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { hours, post, shiftDate, value, weekStart } from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { useStoredValue } from "@/shared/client-storage";
import { useWorkspace } from "@/components/workspace-context";
import { ActionMenu, Badge, Button, ErrorMessage, ExportButton, PageHeader } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { RecordDetail } from "@/components/resource-view";
import { TimeBookingEditor } from "./time-booking-editor";
import { groupBookingWeeks, isoWeek, periodForWeek } from "../history";
import { timeDayMarkers } from "../day-markers";
import { BookingList, WeekNavigator, WeeklyHistory } from "./weekly-bookings";
import { CalendarTimeProposals } from "./calendar-time-proposals";
import { WeekDayOverview } from "./week-day-overview";
import styles from "./time-history.module.css";

type AttendanceDraft = { id: string; createdAt: string; data: RecordData };
export function AttendanceModule({ embedded = false }: { embedded?: boolean }) {
  const { workspace, refresh, online, busy } = useWorkspace();
  const selfBooking = workspace.user.role !== "superadmin";
  const admin = workspace.user.role !== "user";
  const [period, setPeriod] = useViewState<PeriodFilter>(
    workspace.user.id,
    "attendance",
    "period",
    () => ({
      season: seasonForDate(workspace.records.productions),
    }),
  );
  const [week, setWeek] = useViewState(workspace.user.id, "attendance", "week", weekStart());
  const [person, setPerson] = useViewState(
    workspace.user.id,
    "attendance",
    "person",
    selfBooking ? workspace.user.id : workspace.members.find(isStaff)?.id || "",
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DomainRecord | null>(null);
  const [offline, setOffline] = useState(false);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [draftJson, setDraftJson] = useStoredValue(
    `digitalmask-attendance-drafts:${workspace.user.id}`,
    "[]",
  );
  const drafts = useMemo<AttendanceDraft[]>(() => {
    try {
      const parsed = JSON.parse(draftJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [draftJson]);
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
      groupBookingWeeks(workspace.records.attendance || [], { userId: person, period, markers }),
    [workspace.records.attendance, person, period, markers],
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
      {selfBooking && !online && (
        <Button onClick={() => setOffline(true)}>Ohne Internet vormerken</Button>
      )}
    </>
  );
  const sync = async () => {
    setSyncing(true);
    setError("");
    try {
      let remaining = [...drafts];
      for (const draft of drafts) {
        await post("/api/records/attendance", {
          data: { ...draft.data, idempotencyKey: draft.id },
        });
        remaining = remaining.filter((row) => row.id !== draft.id);
        setDraftJson(JSON.stringify(remaining));
      }
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Synchronisierung fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <>
      {embedded ? (
        <header className={styles.moduleHeading}>
          <h2>Anwesenheit im Theater</h2>
          <div className={styles.moduleActions}>
            <ActionMenu>{secondaryActions}</ActionMenu>
            {selfBooking && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} /> Nachtragen
              </Button>
            )}
          </div>
        </header>
      ) : (
        <PageHeader
          eyebrow="DEIN NACHWEIS IM THEATER"
          title="Anwesenheit im Theater"
          description="Beginn, Ende und Pausen. Dieser Nachweis bleibt getrennt von deinen Produktionsstunden."
          compact
          secondaryActions={secondaryActions}
        >
          {selfBooking && (
            <>
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                Anwesenheit nachtragen
              </Button>
            </>
          )}
        </PageHeader>
      )}
      <PeriodPicker
        compact
        records={workspace.records.attendance || []}
        productions={workspace.records.productions}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setWeek(weekForPeriod(workspace.records.attendance || [], person, next, week));
        }}
      />
      <div className={styles.weekToolbar}>
        <WeekNavigator week={week} onChange={selectWeek} />
        {admin && (
          <label className="inline-label">
            Person
            <select value={person} onChange={(event) => setPerson(event.target.value)}>
              {workspace.members.filter(isStaff).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.status !== "active" ? " · ehemaliges Teammitglied" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <Badge>
          <DoorOpen size={13} />
          {hours(total)} h in dieser Woche
        </Badge>
      </div>
      {selfBooking && drafts.length > 0 && (
        <div className="offline-banner">
          <div>
            <strong>{drafts.length} lokale Anwesenheitsentwürfe</strong>
            <p className="small">
              Diese Entwürfe werden ausschließlich als Anwesenheit gespeichert.
            </p>
          </div>
          <Button disabled={!online || syncing || busy} onClick={() => void sync()}>
            <UploadCloud size={16} />
            {syncing ? "Synchronisiert …" : "Anwesenheit synchronisieren"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Lokale Anwesenheitsentwürfe verwerfen?")) setDraftJson("[]");
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      <ErrorMessage message={error} />
      {entries.length ? (
        <section className={styles.currentWeek} aria-label="Anwesenheit der ausgewählten Woche">
          <header className={styles.currentHeading}>
            <h3>
              KW {isoWeek(week).number} · {isoWeek(week).year}
            </h3>
            <strong>{hours(total)} h</strong>
          </header>
          <BookingList
            entries={entries}
            kind="attendance"
            onEdit={setEditing}
            onDetail={setDetail}
          />
        </section>
      ) : (
        <section className={styles.emptyWeek}>
          <h3>Noch keine Anwesenheit in dieser Woche.</h3>
          <p>
            Frühere Buchungen findest du im Wochenverlauf. Kalenderkennzeichen sind keine gebuchten
            Stunden.
          </p>
          {selfBooking && <Button onClick={() => setCreating(true)}>Anwesenheit nachtragen</Button>}
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
        key={`${person}:${period.year || ""}:${period.season || ""}`}
        weeks={weeks}
        selectedWeek={week}
        person={person}
        kind="attendance"
        filtered={!!period.year || !!period.season}
        onAllSeasons={() => setPeriod({})}
        onSelectWeek={selectWeek}
        onEdit={setEditing}
        onDetail={setDetail}
      />
      <CalendarTimeProposals kind="attendance" person={person} week={week} period={period} />
      {creating && (
        <TimeBookingEditor
          kind="attendance"
          defaults={{ date: week }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <TimeBookingEditor
          kind="attendance"
          record={workspace.records.attendance.find((row) => row.id === editing.id) || editing}
          onClose={() => setEditing(null)}
        />
      )}
      {offline && (
        <TimeBookingEditor
          kind="attendance"
          onClose={() => setOffline(false)}
          onDraft={(data) =>
            setDraftJson(
              JSON.stringify([
                ...drafts,
                { id: crypto.randomUUID(), createdAt: new Date().toISOString(), data },
              ]),
            )
          }
        />
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {exporting && (
        <ExportDialog
          kind="attendance"
          filters={{ ...periodExportFilters(period), userId: person, from: week, to: until }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
