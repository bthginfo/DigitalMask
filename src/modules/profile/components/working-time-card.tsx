"use client";
import { useState } from "react";
import { Check, Clock3, Trash2 } from "lucide-react";
import type { Member } from "@/shared/contracts";
import { localDate, weekStart, dateLabel, hours } from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { numberDraft, parseNumberDraft } from "@/shared/number-draft";
import {
  currentWorkingSchedule,
  defaultWorkingDays,
  workingDayLabels,
  type WorkingTimeSchedule,
} from "@/shared/working-time";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal, Section } from "@/components/ui";
import { signedHours } from "@/modules/time-tracking/balance";
import styles from "./working-time-card.module.css";

export function WorkingTimeCard() {
  const { workspace, busy } = useWorkspace();
  const admin = workspace.user.role !== "user";
  const [person, setPerson] = useState(
    isStaff(workspace.user) ? workspace.user.id : workspace.members.find(isStaff)?.id || "",
  );
  const [notice, setNotice] = useState("");
  const member =
    person === workspace.user.id
      ? workspace.user
      : workspace.members.find((row) => row.id === person);
  return (
    <Section title={admin ? "Wochenstunden & Zeitkonten" : "Deine Wochenstunden & Zeitkonto"}>
      <div className="panel-content">
        {admin && (
          <label>
            Person
            <select
              aria-label="Wochenstunden für Person"
              value={person}
              disabled={busy}
              onChange={(event) => {
                setPerson(event.target.value);
                setNotice("");
              }}
            >
              {workspace.members.filter(isStaff).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.status === "disabled" ? " · ehemaliges Teammitglied" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {notice && (
          <p className="success-message" role="status">
            <Check size={16} />
            {notice}
          </p>
        )}
        {member ? (
          <WorkingTimeForm
            key={`${member.id}:${member.preferences?.workingTime?.version || 0}`}
            member={member}
            onSaved={setNotice}
            onSaving={() => setNotice("")}
          />
        ) : (
          <p className="muted">Noch keine Teammitglieder vorhanden.</p>
        )}
      </div>
    </Section>
  );
}

function WorkingTimeForm({
  member,
  onSaved,
  onSaving,
}: {
  member: Member;
  onSaved: (message: string) => void;
  onSaving: () => void;
}) {
  const { workspace, action, busy } = useWorkspace();
  const admin = workspace.user.role !== "user";
  const saved = member.preferences?.workingTime;
  const configured = Boolean(saved?.schedules.length);
  const schedule = currentWorkingSchedule(saved, localDate()) || saved?.schedules.at(-1);
  const [weeklyHours, setWeeklyHours] = useState(
    schedule ? numberDraft(schedule.weeklyMinutes / 60) : "",
  );
  const [days, setDays] = useState(schedule?.workingDays || [...defaultWorkingDays]);
  const [effectiveFrom, setEffectiveFrom] = useState(configured ? localDate() : weekStart());
  const [openingHours, setOpeningHours] = useState(
    numberDraft((saved?.openingBalanceSeconds || 0) / 3600),
  );
  const [error, setError] = useState("");
  const [deletingSchedule, setDeletingSchedule] = useState<WorkingTimeSchedule | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const remainingSchedules =
    saved?.schedules
      .filter((row) => row.effectiveFrom !== deletingSchedule?.effectiveFrom)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)) || [];
  const deletesFirst = Boolean(
    deletingSchedule &&
    saved?.schedules.every((row) => row.effectiveFrom >= deletingSchedule.effectiveFrom),
  );
  return (
    <>
      <form
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          onSaving();
          try {
            const weekly = parseNumberDraft(weeklyHours, {
              label: "Wochenstunden",
              required: true,
              min: 0,
              max: 168,
            })!;
            const opening = parseNumberDraft(openingHours, {
              label: "Startsaldo",
              fallback: 0,
              min: -100000,
              max: 100000,
            })!;
            if (!days.length) throw new Error("Wähle mindestens einen Soll-Tag pro Woche.");
            await action("profile-update", undefined, {
              ...(member.id !== workspace.user.id ? { memberId: member.id } : {}),
              workingTime: {
                weeklyMinutes: Math.round(weekly * 60),
                workingDays: days,
                effectiveFrom,
                openingBalanceSeconds: Math.round(opening * 3600),
                expectedVersion: saved?.version || 0,
              },
            });
            onSaved("Wochenstunden und Zeitkonto gespeichert.");
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <p className="small muted">
          Die Anwesenheit wird mit deinen Sollstunden verglichen. Produktionsbuchungen werden dafür
          nicht zusätzlich gezählt.
        </p>
        <div className="form-grid">
          <label>
            Wochenstunden
            <input
              type="number"
              min={0}
              max={168}
              step="any"
              required
              placeholder="z. B. 40"
              value={weeklyHours}
              onChange={(event) => setWeeklyHours(event.target.value)}
            />
          </label>
          <label>
            {configured ? "Änderung gilt ab" : "Zeitkonto beginnt am"}
            <input
              type="date"
              required
              min={configured ? localDate() : "2000-01-01"}
              max="2200-12-31"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </label>
        </div>
        <fieldset className={styles.days}>
          <legend>
            Soll-Tage pro Woche · {days.length} {days.length === 1 ? "Tag" : "Tage"}
          </legend>
          <div>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={(event) =>
                    setDays((previous) =>
                      event.target.checked
                        ? [...previous, day]
                        : previous.filter((value) => value !== day),
                    )
                  }
                />
                {workingDayLabels[day]}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="small muted">
          Standard: 6 Tage, Montag bis Samstag. Deine Wochenstunden verteilen sich gleichmäßig auf
          die ausgewählten Tage. Soll zählt nur bis einschließlich heute.
        </p>
        <label>
          Startsaldo in Stunden
          <input
            type="number"
            step="any"
            min={-100000}
            max={100000}
            value={openingHours}
            onChange={(event) => setOpeningHours(event.target.value)}
          />
        </label>
        <p className="small muted">
          Trage vorhandene Plus- oder Minusstunden ein, z. B. 12 oder -4. Vor dem Beginn des
          Zeitkontos entstehen keine fehlenden Stunden. Eine Änderung des Startsaldos korrigiert den
          Gesamtstand.
        </p>
        <p className={styles.creditNote}>
          Urlaub und Krank füllen die Sollzeit eines Soll-Tages auf. ABF, Ruhetag, halber freier Tag
          und Feiertage erhalten keine automatische Gutschrift.
        </p>
        {saved && configured && (
          <details className={styles.history}>
            <summary>
              Bisherige Sollzeiten · Startsaldo {signedHours(saved.openingBalanceSeconds)} h
            </summary>
            <ul>
              {saved.schedules.map((row) => (
                <li key={row.effectiveFrom}>
                  <div className={styles.historyInfo}>
                    <strong>Ab {dateLabel(row.effectiveFrom)}</strong>
                    <span>
                      {hours(row.weeklyMinutes * 60)} h / Woche ·{" "}
                      {row.workingDays.map((day) => workingDayLabels[day]).join(", ")}
                    </span>
                  </div>
                  {admin && (
                    <Button
                      variant="danger-ghost"
                      disabled={busy}
                      onClick={() => {
                        setDeleteError("");
                        setDeletingSchedule(row);
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Sollzeit löschen
                      <span className="visually-hidden">
                        {" "}
                        für {member.name} ab {dateLabel(row.effectiveFrom)}
                      </span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="small muted">
              Neue Sollzeiten gelten ab dem gewählten Datum.{" "}
              {admin
                ? "Gespeicherte Einträge kannst du hier einzeln löschen."
                : "Frühere Sollzeiten bleiben erhalten."}
            </p>
          </details>
        )}
        {saved && !configured && (
          <p className="small muted">
            Keine Sollzeiten hinterlegt. Lege neue Wochenstunden und einen Beginn fest. Dein
            Startsaldo bleibt erhalten.
          </p>
        )}
        <ErrorMessage message={error} />
        <Button type="submit" variant="primary" disabled={busy}>
          <Clock3 size={16} />
          {busy ? "Wird gespeichert …" : "Wochenstunden speichern"}
        </Button>
      </form>
      {admin && deletingSchedule && saved && (
        <Modal
          title="Sollzeit löschen?"
          onClose={() => {
            if (!deleting) setDeletingSchedule(null);
          }}
        >
          <div className={styles.deleteConfirmation} aria-busy={deleting}>
            <dl className={styles.deleteSummary}>
              <div>
                <dt>Person</dt>
                <dd>{member.name}</dd>
              </div>
              <div>
                <dt>Gültig ab</dt>
                <dd>{dateLabel(deletingSchedule.effectiveFrom)}</dd>
              </div>
              <div>
                <dt>Wochenstunden</dt>
                <dd>{hours(deletingSchedule.weeklyMinutes * 60)} h</dd>
              </div>
            </dl>
            <p>
              Das Zeitkonto wird neu berechnet. Die gespeicherten Anwesenheiten und der Startsaldo
              bleiben erhalten.
            </p>
            <p>
              {!remainingSchedules.length
                ? "Danach sind keine Sollzeiten hinterlegt. Plus- und Minusstunden werden erst wieder angezeigt, wenn neue Wochenstunden festgelegt sind."
                : deletesFirst
                  ? `Das Zeitkonto beginnt danach am ${dateLabel(remainingSchedules[0].effectiveFrom)}. Vorher wird keine Sollzeit berechnet.`
                  : "Die vorherige Sollzeit gilt dann weiter bis zur nächsten hinterlegten Änderung."}
            </p>
            <ErrorMessage message={deleteError} />
            <div className={styles.deleteActions}>
              <Button disabled={deleting} onClick={() => setDeletingSchedule(null)}>
                Abbrechen
              </Button>
              <Button
                variant="danger-ghost"
                disabled={busy || deleting}
                onClick={async () => {
                  setDeleteError("");
                  setDeleting(true);
                  onSaving();
                  try {
                    await action("profile-update", undefined, {
                      ...(member.id !== workspace.user.id ? { memberId: member.id } : {}),
                      workingTimeDelete: {
                        effectiveFrom: deletingSchedule.effectiveFrom,
                        expectedVersion: saved.version,
                      },
                    });
                    setDeletingSchedule(null);
                    onSaved("Sollzeit gelöscht. Das Zeitkonto wurde neu berechnet.");
                  } catch (exception) {
                    setDeleteError(
                      exception instanceof Error
                        ? exception.message
                        : "Sollzeit konnte nicht gelöscht werden.",
                    );
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                {deleting ? "Wird gelöscht …" : "Sollzeit löschen"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
