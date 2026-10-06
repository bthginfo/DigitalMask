"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { DomainRecord, Member, RecordData } from "@/shared/contracts";
import { shiftDate } from "@/shared/client-api";
import { Button } from "@/components/ui";
import { calendarDayEntries, calendarDayLabel } from "./day-details";
import { MobileDayAgenda } from "./mobile-day-agenda";
import type { CalendarInstance } from "./team-calendar";
import styles from "./mobile-day-sheet.module.css";

export type DayCreateOption = {
  id: string;
  label: string;
  personName?: string;
  participantIds: string[];
};

export function MobileDaySheet({
  events,
  day,
  members,
  productions,
  contextLabel,
  minDay,
  maxDay,
  createOptions,
  canEdit,
  onSelect,
  onClose,
  onRestoreFocus,
  onOpen,
  onEdit,
  onCreate,
}: {
  events: CalendarInstance[];
  day: string;
  members: Pick<Member, "id" | "name">[];
  productions: DomainRecord[];
  contextLabel: string;
  minDay: string;
  maxDay: string;
  createOptions: DayCreateOption[];
  canEdit: (record: DomainRecord) => boolean;
  onSelect: (day: string) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  onOpen: (record: DomainRecord) => void;
  onEdit: (record: DomainRecord) => void;
  onCreate: (defaults: RecordData) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef(onRestoreFocus);
  const headingId = useId();
  const summaryId = useId();
  const [createPerson, setCreatePerson] = useState(createOptions[0]?.id || "");
  const createOption =
    createOptions.find((option) => option.id === createPerson) || createOptions[0];
  const count = useMemo(() => calendarDayEntries(events, day).length, [events, day]);

  useEffect(() => {
    restoreFocus.current = onRestoreFocus;
  }, [onRestoreFocus]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        // FullCalendar can retain another control's focus or replace the clicked day button.
        restoreFocus.current();
      });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      data-calendar-day-sheet
      aria-labelledby={headingId}
      aria-describedby={summaryId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <header className={styles.heading}>
        <div>
          <p className="eyebrow">TAG IM KALENDER</p>
          <h2 id={headingId}>{calendarDayLabel(day)}</h2>
          <p className={styles.summary} id={summaryId}>
            {contextLabel} · {count} {count === 1 ? "Termin" : "Termine"}
          </p>
        </div>
        <button
          type="button"
          className={`icon-button ${styles.close}`}
          aria-label="Tagesdetails schließen"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </header>
      <nav className={styles.dayNavigation} aria-label="Tag wechseln">
        <button
          type="button"
          className="text-button"
          disabled={day <= minDay}
          onClick={() => onSelect(shiftDate(day, -1))}
        >
          <ChevronLeft size={16} />
          Vorheriger Tag
        </button>
        <button
          type="button"
          className="text-button"
          disabled={day >= maxDay}
          onClick={() => onSelect(shiftDate(day, 1))}
        >
          Nächster Tag
          <ChevronRight size={16} />
        </button>
      </nav>
      <div className={`team-mobile-services ${styles.body}`}>
        <MobileDayAgenda
          events={events}
          day={day}
          members={members}
          productions={productions}
          canEdit={canEdit}
          onOpen={onOpen}
          onEdit={onEdit}
        />
      </div>
      {!!createOption && (
        <footer className={`team-mobile-create ${styles.footer}`}>
          {createOptions.length > 1 && (
            <label>
              Termin für
              <select
                value={createOption.id}
                onChange={(event) => setCreatePerson(event.target.value)}
              >
                {createOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.personName || option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            variant="primary"
            onClick={() =>
              onCreate({
                start: `${day}T09:00`,
                end: `${day}T17:00`,
                participantIds: createOption.participantIds,
              })
            }
          >
            <Plus size={16} />
            {createOptions.length > 1 ? "Termin anlegen" : createOption.label}
          </Button>
        </footer>
      )}
    </dialog>
  );
}
