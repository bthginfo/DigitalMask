"use client";
import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import type { Member } from "@/shared/contracts";
import { localDate, weekStart, dateLabel, hours } from "@/shared/client-api";
import { isStaff } from "@/shared/client-members";
import { numberDraft, parseNumberDraft } from "@/shared/number-draft";
import {
  currentWorkingSchedule,
  defaultWorkingDays,
  workingDayLabels,
} from "@/shared/working-time";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Section } from "@/components/ui";
import { signedHours } from "@/modules/time-tracking/balance";
import styles from "./working-time-card.module.css";

export function WorkingTimeCard() {
  const { workspace } = useWorkspace();
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
            onSaved={() => setNotice("Wochenstunden und Zeitkonto gespeichert.")}
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
  onSaved: () => void;
  onSaving: () => void;
}) {
  const { workspace, action, busy } = useWorkspace();
  const saved = member.preferences?.workingTime;
  const schedule = currentWorkingSchedule(saved, localDate()) || saved?.schedules.at(-1);
  const [weeklyHours, setWeeklyHours] = useState(
    schedule ? numberDraft(schedule.weeklyMinutes / 60) : "",
  );
  const [days, setDays] = useState(schedule?.workingDays || [...defaultWorkingDays]);
  const [effectiveFrom, setEffectiveFrom] = useState(saved ? localDate() : weekStart());
  const [openingHours, setOpeningHours] = useState(
    numberDraft((saved?.openingBalanceSeconds || 0) / 3600),
  );
  const [error, setError] = useState("");
  return (
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
          onSaved();
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
          {saved ? "Änderung gilt ab" : "Zeitkonto beginnt am"}
          <input
            type="date"
            required
            min={saved ? localDate() : "2000-01-01"}
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
        Standard: 6 Tage, Montag bis Samstag. Deine Wochenstunden verteilen sich gleichmäßig auf die
        ausgewählten Tage. Soll zählt nur bis einschließlich heute.
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
      {saved && (
        <details className={styles.history}>
          <summary>
            Bisherige Sollzeiten · Startsaldo {signedHours(saved.openingBalanceSeconds)} h
          </summary>
          <ul>
            {saved.schedules.map((row) => (
              <li key={row.effectiveFrom}>
                <strong>Ab {dateLabel(row.effectiveFrom)}</strong>
                <span>
                  {hours(row.weeklyMinutes * 60)} h / Woche ·{" "}
                  {row.workingDays.map((day) => workingDayLabels[day]).join(", ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">
            Neue Sollzeiten gelten ab dem gewählten Datum. Frühere Sollzeiten bleiben erhalten.
          </p>
        </details>
      )}
      <ErrorMessage message={error} />
      <Button type="submit" variant="primary" disabled={busy}>
        <Clock3 size={16} />
        {busy ? "Wird gespeichert …" : "Wochenstunden speichern"}
      </Button>
    </form>
  );
}
