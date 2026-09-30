"use client";
import { useMemo, useState } from "react";
import { DoorOpen, Plus, UploadCloud } from "lucide-react";
import { PeriodPicker, periodExportFilters, weekForPeriod } from "@/components/period-picker";
import { recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  instantDate,
  num,
  post,
  shiftDate,
  timeAllocations,
  value,
  weekStart,
} from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { useStoredValue } from "@/shared/client-storage";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, PageHeader } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { RecordDetail } from "@/components/resource-view";
import { TimeBookingEditor } from "./time-booking-editor";

type AttendanceDraft = { id: string; createdAt: string; data: RecordData };
export function AttendanceModule() {
  const { workspace, refresh, online, busy } = useWorkspace();
  const selfBooking = workspace.user.role !== "superadmin";
  const admin = workspace.user.role !== "user";
  const [period, setPeriod] = useState<PeriodFilter>({});
  const [week, setWeek] = useState(weekStart());
  const [person, setPerson] = useState(
    selfBooking ? workspace.user.id : workspace.members.find(isStaff)?.id || "",
  );
  const [creating, setCreating] = useState(false);
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
  const entries = (workspace.records.attendance || [])
    .filter(
      (record) =>
        record.data.userId === person &&
        recordMatchesPeriod(record, period, workspace.records.productions) &&
        timeAllocations(record.data).some((day) => day.date >= week && day.date <= until),
    )
    .sort((a, b) => value(b.data, "start").localeCompare(value(a.data, "start")));
  const allocations = entries
    .flatMap((record) => timeAllocations(record.data))
    .filter(
      (day) =>
        day.date >= week &&
        day.date <= until &&
        (!period.year || Number(day.date.slice(0, 4)) === period.year),
    );
  const total = allocations.reduce((sum, day) => sum + day.seconds, 0);
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
      <PageHeader
        eyebrow="DEIN NACHWEIS IM THEATER"
        title="Anwesenheit im Theater"
        description="Beginn, Ende und Pausen. Dieser Nachweis bleibt getrennt von deinen Produktionsstunden."
      >
        <ExportButton onClick={() => setExporting(true)} />
        {selfBooking && (
          <>
            <Button onClick={() => setOffline(true)}>Offlineentwurf</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Anwesenheit nachtragen
            </Button>
          </>
        )}
      </PageHeader>
      <PeriodPicker
        records={workspace.records.attendance || []}
        productions={workspace.records.productions}
        season={false}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setWeek(weekForPeriod(workspace.records.attendance || [], person, next, week));
        }}
      />
      <div className="toolbar wrap">
        <label className="inline-label">
          Woche ab
          <input
            type="date"
            value={week}
            onChange={(event) => {
              if (event.target.value) {
                setWeek(weekStart(instantDate(event.target.value)));
                if (period.year)
                  setPeriod({ ...period, year: Number(event.target.value.slice(0, 4)) });
              }
            }}
          />
        </label>
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
        <>
          <div className="attendance-mobile-list">
            {entries.map((record) => (
              <button
                key={record.id}
                onClick={() => setDetail(record)}
                className="attendance-mobile-card"
              >
                <span className="attendance-mobile-heading">
                  <span>{dateLabel(value(record.data, "date"))}</span>
                  <strong>{hours(num(record.data, "durationSeconds"))} h</strong>
                </span>
                <strong>{value(record.data, "title") || "Anwesenheit"}</strong>
                {!!value(record.data, "notes") && (
                  <span className="muted">{value(record.data, "notes")}</span>
                )}
                <span className="attendance-mobile-times">
                  <span>
                    <small>Beginn</small>
                    {dateLabel(value(record.data, "start"), true)}
                  </span>
                  <span>
                    <small>Ende</small>
                    {dateLabel(value(record.data, "end"), true)}
                  </span>
                  <span>
                    <small>Pause</small>
                    {Math.round(num(record.data, "pauseSeconds") / 60)} min
                  </span>
                  <span>
                    <small>Ohne Pause</small>
                    {hours(num(record.data, "durationSeconds"))} h
                  </span>
                </span>
              </button>
            ))}
            <p className="small muted">{hours(total)} h Anwesenheit in der ausgewählten Woche.</p>
          </div>
          <div className="table-scroll panel attendance-list">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Anwesenheit</th>
                  <th>Beginn / Ende</th>
                  <th>Pause</th>
                  <th>Ohne Pause</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((record) => (
                  <tr key={record.id}>
                    <td>{dateLabel(value(record.data, "date"))}</td>
                    <td>
                      <button className="text-button strong" onClick={() => setDetail(record)}>
                        {value(record.data, "title") || "Anwesenheit"}
                      </button>
                      <p className="small muted">{value(record.data, "notes")}</p>
                    </td>
                    <td>
                      {dateLabel(value(record.data, "start"), true)}
                      <br />
                      {dateLabel(value(record.data, "end"), true)}
                    </td>
                    <td>{Math.round(num(record.data, "pauseSeconds") / 60)} min</td>
                    <td className="strong">{hours(num(record.data, "durationSeconds"))} h</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Anwesenheit in der ausgewählten Woche</td>
                  <td>{hours(total)} h</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <Empty
          title="Noch keine Anwesenheit in dieser Woche."
          description="Anwesenheit lässt sich unabhängig von einzelnen Tätigkeiten erfassen. Nutze den Timer oder trage Beginn und Ende nach."
          action={selfBooking ? "Anwesenheit nachtragen" : undefined}
          onAction={() => setCreating(true)}
        />
      )}
      {creating && <TimeBookingEditor kind="attendance" onClose={() => setCreating(false)} />}
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
