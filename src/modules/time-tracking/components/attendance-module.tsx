"use client";
import { useMemo, useState } from "react";
import { useViewState } from "@/shared/view-state";
import { Plus, UploadCloud } from "lucide-react";
import { seasonForDate } from "@/shared/period-filter";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { instantDate, localDate, post, shiftDate, value, weekStart } from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { useStoredValue } from "@/shared/client-storage";
import { useWorkspace } from "@/components/workspace-context";
import { ActionMenu, Button, ErrorMessage, ExportButton } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { RecordDetail } from "@/components/resource-view";
import { TimeBookingEditor } from "./time-booking-editor";
import { bookingDay, groupBookingWeeks, isoWeek } from "../history";
import { timeDayMarkers } from "../day-markers";
import { attendanceCreditsByDay } from "../balance";
import { CalendarTimeProposals } from "./calendar-time-proposals";
import { WeekDayOverview } from "./week-day-overview";
import { AttendanceBalanceCard } from "./attendance-balance";
import styles from "./time-history.module.css";
import { useConfirm } from "@/components/confirm-dialog";

type AttendanceDraft = { id: string; createdAt: string; data: RecordData };

export function AttendanceModule() {
  const confirm = useConfirm();
  const { workspace, refresh, reload, online, busy } = useWorkspace();
  const selfBooking = workspace.user.role !== "superadmin";
  const admin = workspace.user.role !== "user";
  const [week, setWeek] = useViewState(workspace.user.id, "attendance", "week", weekStart());
  const [person, setPerson] = useViewState(
    workspace.user.id,
    "attendance",
    "person",
    selfBooking ? workspace.user.id : workspace.members.find(isStaff)?.id || "",
  );
  const [creating, setCreating] = useState("");
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
  const markers = useMemo(
    () =>
      timeDayMarkers({
        events: workspace.records.events,
        calendarCategories: workspace.records.calendarCategories,
        userId: person,
        from: week,
        to: until,
      }),
    [workspace.records.events, workspace.records.calendarCategories, person, week, until],
  );
  const member =
    person === workspace.user.id
      ? workspace.user
      : workspace.members.find((row) => row.id === person);
  const settings = member?.preferences?.workingTime;
  const today = localDate();
  const selected = useMemo(() => {
    const creditsByDay = attendanceCreditsByDay({
      userId: person,
      markers,
      settings,
      leave: workspace.records.leave,
      through: today,
    });
    return groupBookingWeeks(workspace.records.attendance || [], {
      userId: person,
      markers,
      creditsByDay,
    }).find((row) => row.start === week);
  }, [
    workspace.records.attendance,
    workspace.records.leave,
    person,
    markers,
    settings,
    today,
    week,
  ]);
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
      await reload(["attendance"]);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Synchronisierung fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <>
      <header className={styles.moduleHeading}>
        <h2>Anwesenheit im Theater</h2>
        <div className={styles.moduleActions}>
          <ActionMenu>{secondaryActions}</ActionMenu>
          {selfBooking && (
            <Button variant="primary" onClick={() => setCreating(bookingDay(week))}>
              <Plus size={16} /> Nachtragen
            </Button>
          )}
        </div>
      </header>
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
            onClick={async () => {
              if (
                await confirm({
                  message: `${drafts.length === 1 ? "Den lokalen Anwesenheitsentwurf" : `Alle ${drafts.length} lokalen Anwesenheitsentwürfe`} verwerfen?`,
                  confirmLabel: "Verwerfen",
                  destructive: true,
                })
              )
                setDraftJson("[]");
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      <ErrorMessage message={error} />
      <AttendanceBalanceCard
        key={person}
        person={person}
        selectedWeek={week}
        onWeekChange={setWeek}
      />
      {admin && (
        <div className={styles.weekToolbar}>
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
        </div>
      )}
      <WeekDayOverview
        key={`${person}:${week}`}
        kind="attendance"
        week={week}
        person={person}
        entries={selected?.entries || []}
        markers={selected?.markers || []}
        creditsByDay={selected?.creditsByDay}
        onWeekChange={setWeek}
        onEdit={setEditing}
        onDetail={setDetail}
      >
        <CalendarTimeProposals kind="attendance" person={person} week={week} period={{}} />
      </WeekDayOverview>
      {creating && (
        <TimeBookingEditor
          kind="attendance"
          defaults={{ date: creating }}
          onSaved={(record) => {
            setPerson(workspace.user.id);
            setWeek(isoWeek(value(record.data, "date")).start);
          }}
          onClose={() => setCreating("")}
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
          filters={{
            // Week navigation replaces the season filter on screen; exports keep the season.
            season: seasonForDate(workspace.records.productions, instantDate(week)),
            userId: person,
            from: week,
            to: until,
          }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
