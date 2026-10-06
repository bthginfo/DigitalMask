"use client";
import { useState } from "react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { ids, instantDate, localDate, localDateTime, shiftDate, value } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { calendarPresentation } from "@/shared/calendar-categories";
import { calendarCategoryBehavior } from "@/shared/calendar-categories";
import { sortCalendarStaff } from "@/shared/calendar-team";
import { sortProductionsByPremiere } from "@/shared/production-order";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { calendarCategories } from "./client-calendar";

export function EventEditor({
  record,
  defaults = {},
  lockedProductionId,
  onClose,
  onSaved,
}: {
  record?: DomainRecord;
  defaults?: RecordData;
  lockedProductionId?: string;
  onClose: () => void;
  onSaved?: (record: DomainRecord) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const initial = { ...defaults, ...record?.data };
  const options = calendarCategories(workspace);
  const initialCategory = value(initial, "category") || options[0]?.key || "";
  const originalAllDay = record
    ? calendarPresentation(
        record,
        workspace.records.productions,
        workspace.records.calendarCategories,
      ).allDay
    : options.find((option) => option.key === initialCategory)?.allDay;
  const today = localDate();
  const initialStart = initial.start ? localDateTime(String(initial.start)) : `${today}T09:00`;
  const initialEnd = initial.end ? localDateTime(String(initial.end)) : `${today}T17:00`;
  const [title, setTitle] = useState(value(initial, "title"));
  const [category, setCategory] = useState(initialCategory);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [from, setFrom] = useState(initialStart.slice(0, 10));
  const [to, setTo] = useState(
    originalAllDay && record ? shiftDate(initialEnd.slice(0, 10), -1) : initialEnd.slice(0, 10),
  );
  const [production, setProduction] = useState(
    lockedProductionId ?? value(initial, "productionId"),
  );
  const admin = workspace.user.role !== "user";
  const [people, setPeople] = useState(
    admin ? ids(initial, "participantIds") : [workspace.user.id],
  );
  const [location, setLocation] = useState(value(initial, "location"));
  const [recurrence, setRecurrence] = useState(value(initial, "recurrence") || "none");
  const [until, setUntil] = useState(value(initial, "until"));
  const [exceptions, setExceptions] = useState(ids(initial, "exceptions").join("\n"));
  const [error, setError] = useState("");
  const selected = options.find((option) => option.key === category);
  const allDay = selected?.allDay === true;
  const suggestedTitle =
    value(
      workspace.records.productions.find((row) => row.id === production)?.data || {},
      "title",
    ) ||
    selected?.name ||
    "Termin";
  const members = sortCalendarStaff(
    workspace.members.filter(
      (member) =>
        (admin || member.id === workspace.user.id) &&
        (isActiveStaff(member) || people.includes(member.id)),
    ),
  );
  const productions = sortProductionsByPremiere(workspace.records.productions);
  const behavior = calendarCategoryBehavior(category, selected);
  return (
    <Modal title={`Termin ${record ? "bearbeiten" : "anlegen"}`} onClose={onClose} wide>
      <form
        className="event-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            if (!selected)
              throw new Error(
                "Bitte lege zuerst eine Kalenderart an oder wähle eine vorhandene aus.",
              );
            if (record?.data.leaveId)
              throw new Error(
                "Dieser Eintrag gehört zu einem genehmigten Freiwunsch. Bitte nutze den Freiwunschablauf.",
              );
            const startDate = instantDate(allDay ? `${from}T00:00:00` : start),
              endDate = instantDate(allDay ? `${shiftDate(to, 1)}T00:00:00` : end);
            if (
              !Number.isFinite(startDate.getTime()) ||
              !Number.isFinite(endDate.getTime()) ||
              endDate <= startDate ||
              (allDay && to < from)
            )
              throw new Error("Das Ende muss nach dem Beginn liegen.");
            const exceptionDays = exceptions
              .split("\n")
              .map((day) => day.trim())
              .filter(Boolean);
            if (exceptionDays.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day)))
              throw new Error("Trage Ausnahmen als Datum im Format JJJJ-MM-TT ein.");
            const saved = await save(
              "events",
              {
                title: title.trim(),
                category,
                allDay,
                start: startDate.toISOString(),
                end: endDate.toISOString(),
                productionId: production,
                participantIds: people,
                location: location.trim(),
                recurrence,
                until: recurrence === "none" ? "" : until,
                exceptions: recurrence === "none" ? [] : exceptionDays,
              },
              record,
            );
            onSaved?.(saved);
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <p className="muted booking-intro">
          Lass den Titel leer, um die Produktion oder Kalenderart anzuzeigen.{" "}
          {record?.data.recurrence && record.data.recurrence !== "none"
            ? "Änderungen betreffen die ganze Terminserie."
            : ""}
        </p>
        <label>
          Titel (optional)
          <input
            maxLength={200}
            value={title}
            placeholder={suggestedTitle}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Kalenderart
            <select
              required
              value={category}
              onChange={(event) => {
                const next = options.find((option) => option.key === event.target.value);
                if (next?.allDay && !allDay) {
                  setFrom(start.slice(0, 10));
                  setTo(end.slice(0, 10));
                }
                if (!next?.allDay && allDay) {
                  setStart(`${from}T09:00`);
                  setEnd(`${to}T17:00`);
                }
                setCategory(event.target.value);
              }}
            >
              <option value="">Bitte auswählen</option>
              {!selected && category && (
                <option value={category} disabled>
                  Bisherige Art · bitte neu wählen
                </option>
              )}
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                  {option.allDay ? " · ganztägig" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Produktion
            <select
              aria-label="Produktion"
              disabled={lockedProductionId !== undefined}
              value={production}
              onChange={(event) => setProduction(event.target.value)}
            >
              <option value="">Ohne Produktion</option>
              {productions.map((row) => (
                <option key={row.id} value={row.id}>
                  {value(row.data, "title")}
                </option>
              ))}
            </select>
          </label>
        </div>
        {behavior.background && (
          <p className="help-note">
            {behavior.background === "service"
              ? "Arbeitszeit im Hintergrund · weitere Termine können innerhalb dieses Dienstes liegen."
              : "Freier halber Tag als Hinweis · weitere Termine bleiben möglich."}
          </p>
        )}
        {allDay && (
          <p className="event-all-day-note">
            <span style={{ background: selected?.color }} />
            Ganztägig · keine Uhrzeiten nötig. Der letzte Tag ist eingeschlossen.
          </p>
        )}
        <div className="form-grid">
          {allDay ? (
            <>
              <label>
                Von
                <input
                  type="date"
                  required
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                Bis (einschließlich)
                <input
                  type="date"
                  required
                  min={from}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Beginn
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label>
                Ende
                <input
                  type="datetime-local"
                  required
                  min={start}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <fieldset className="form-multi">
          <legend>Personen</legend>
          {members.map((member) => (
            <label className="check-label" key={member.id}>
              <input
                type="checkbox"
                disabled={!admin}
                checked={people.includes(member.id)}
                onChange={(event) =>
                  setPeople(
                    event.target.checked
                      ? [...people, member.id]
                      : people.filter((id) => id !== member.id),
                  )
                }
              />
              {member.name}
              {!isActiveStaff(member) && (
                <span className="small muted"> · historische Zuordnung (entfernen)</span>
              )}
            </label>
          ))}
          {!members.length && (
            <p className="small muted">Keine aktiven Teammitglieder verfügbar.</p>
          )}
          {!admin && (
            <p className="small muted">
              Du planst deinen eigenen Kalender. Einträge für andere Personen übernehmen Admins.
            </p>
          )}
          {admin && (
            <p className="small muted">
              Ohne ausgewählte Person erscheint der Termin unter Gäste/Aushilfen.
            </p>
          )}
        </fieldset>
        <label>
          Ort
          <input
            maxLength={200}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Wiederholung
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}>
              <option value="none">Keine</option>
              <option value="daily">Täglich</option>
              <option value="weekly">Wöchentlich</option>
            </select>
          </label>
          {recurrence !== "none" && (
            <label>
              Wiederholen bis
              <input
                type="date"
                required
                min={allDay ? from : start.slice(0, 10)}
                value={until}
                onChange={(event) => setUntil(event.target.value)}
              />
            </label>
          )}
        </div>
        {recurrence !== "none" && (
          <label>
            Ausnahmen (ein Datum je Zeile)
            <textarea
              rows={3}
              placeholder="2026-12-24"
              value={exceptions}
              onChange={(event) => setExceptions(event.target.value)}
            />
          </label>
        )}
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !selected || !!record?.data.leaveId}
          >
            Speichern
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
