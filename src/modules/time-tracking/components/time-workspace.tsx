"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Clock3, DoorOpen } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { hours, shiftDate, timeAllocations, weekStart } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { PageHeader } from "@/components/ui";
import { WorkTimeModule } from "@/components/modules/time";
import { AttendanceModule } from "./attendance-module";
import { TimerPanel } from "./work-timer";
import { TimeBookingEditor } from "./time-booking-editor";
import styles from "./time-workspace.module.css";

export function TimeWorkspace() {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useState("attendance");
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
      <PageHeader
        eyebrow="ZEIT IM THEATER"
        title="Zeit buchen"
        description="Anwesenheit und Tätigkeiten getrennt erfassen. Beide Timer können gleichzeitig laufen."
        compact
      />
      {selfBooking && (
        <>
          <div className={`dual-timers ${styles.timers}`}>
            <TimerPanel kind="attendance" onBooked={setBooked} />
            <TimerPanel onBooked={setBooked} />
          </div>
          <section
            className={`time-comparison ${styles.comparison}`}
            aria-label="Vergleich deiner aktuellen Woche"
          >
            <div>
              <span className="eyebrow">DEINE AKTUELLE WOCHE</span>
              <p className="small muted">
                Bereits gebuchte Zeiten · laufende Timer werden erst nach dem Stoppen gezählt.
              </p>
            </div>
            <div>
              <DoorOpen size={19} />
              <span>
                Anwesenheit<strong>{hours(totals.attendance)} h</strong>
              </span>
            </div>
            <div>
              <Clock3 size={19} />
              <span>
                Tätigkeiten<strong>{hours(totals.work)} h</strong>
              </span>
            </div>
            <div className="time-comparison-note">
              <ArrowRight size={15} />
              <span>Du musst nicht jede Minute einer Produktion zuordnen.</span>
            </div>
          </section>
        </>
      )}
      <div className="tabs time-workspace-tabs" aria-label="Zeitnachweise">
        <button
          className={tab === "attendance" ? "active" : ""}
          aria-current={tab === "attendance" ? "page" : undefined}
          onClick={() => setTab("attendance")}
        >
          <DoorOpen size={16} />
          <span className={styles.desktopLabel}>Anwesenheit im Theater</span>
          <span className={styles.mobileLabel}>Anwesenheit</span>
        </button>
        <button
          className={tab === "work" ? "active" : ""}
          aria-current={tab === "work" ? "page" : undefined}
          onClick={() => setTab("work")}
        >
          <Clock3 size={16} />
          <span className={styles.desktopLabel}>Produktions- / Arbeitszeiten</span>
          <span className={styles.mobileLabel}>Arbeitszeiten</span>
        </button>
      </div>
      <div hidden={tab !== "attendance"}>
        <AttendanceModule embedded />
      </div>
      <div hidden={tab !== "work"}>
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
