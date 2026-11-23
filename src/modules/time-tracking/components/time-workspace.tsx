"use client";
import { useMemo, useState } from "react";
import { Clock3, DoorOpen } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { hours, shiftDate, timeAllocations, weekStart } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { PageHeader } from "@/components/ui";
import { WorkTimeModule } from "@/components/modules/time";
import { AttendanceModule } from "./attendance-module";
import { TimerPanel } from "./work-timer";
import { TimeBookingEditor } from "./time-booking-editor";
import styles from "./time-workspace.module.css";
import { useViewState } from "@/shared/view-state";

export function TimeWorkspace() {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useViewState(workspace.user.id, "time", "tab", "attendance");
  const [booked, setBooked] = useState<DomainRecord | null>(null);
  const selfBooking = workspace.user.role !== "superadmin";
  const week = weekStart(),
    until = shiftDate(week, 6);
  const totals = useMemo(() => {
    const sum = (records: DomainRecord[]) =>
      records
        .filter((row) => row.data.userId === workspace.user.id)
        .flatMap((row) => timeAllocations(row.data))
        .filter((day) => day.date >= week && day.date <= until)
        .reduce((total, day) => total + day.seconds, 0);
    return {
      attendance: sum(workspace.records.attendance || []),
      work: sum(workspace.records.time),
    };
  }, [workspace.records.time, workspace.records.attendance, workspace.user.id, week, until]);
  return (
    <div className={styles.workspace}>
      <PageHeader title="Zeit buchen" compact />
      <div className={styles.choices} role="group" aria-label="Zeitnachweise">
        {(["attendance", "work"] as const).map((key) => {
          const attendance = key === "attendance";
          const Icon = attendance ? DoorOpen : Clock3;
          const timer = attendance ? workspace.attendanceTimer : workspace.timer;
          const name = attendance ? "Anwesenheit" : "Produktionsstunden";
          return (
            <button
              key={key}
              aria-label={name}
              aria-pressed={tab === key}
              aria-describedby={selfBooking ? `time-week-${key}` : undefined}
              onClick={() => setTab(key)}
            >
              <span>
                <Icon size={17} aria-hidden="true" />
                {name}
              </span>
              {selfBooking && (
                <small id={`time-week-${key}`}>
                  <strong>{hours(totals[key])} h</strong> diese Woche
                  {timer && <em>{timer.data.pausedAt ? "Pausiert" : "Timer läuft"}</em>}
                </small>
              )}
            </button>
          );
        })}
      </div>
      <div hidden={tab !== "attendance"}>
        {selfBooking && <TimerPanel kind="attendance" onBooked={setBooked} />}
        <AttendanceModule embedded />
      </div>
      <div hidden={tab !== "work"}>
        {selfBooking && <TimerPanel onBooked={setBooked} />}
        <WorkTimeModule embedded />
      </div>
      {booked && (
        <TimeBookingEditor
          kind={booked.kind === "attendance" ? "attendance" : "time"}
          record={booked}
          onClose={() => setBooked(null)}
        />
      )}
    </div>
  );
}
