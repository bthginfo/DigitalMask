"use client";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { isActiveStaff } from "@/shared/client-members";
import { sortCalendarStaff } from "@/shared/calendar-team";
import { calendarProductionRecords } from "@/shared/calendar-access";
import { calendarCategories } from "@/modules/calendar/components/client-calendar";
import type { GoogleCalendarSelection } from "../contracts";
import styles from "./google-calendar.module.css";

export function GoogleCalendarSelectionFields({
  selection,
  onChange,
  disabled,
  initialSelection,
}: {
  selection: GoogleCalendarSelection;
  onChange: (selection: GoogleCalendarSelection) => void;
  disabled: boolean;
  initialSelection?: GoogleCalendarSelection;
}) {
  const { workspace } = useWorkspace();
  const staff = sortCalendarStaff(workspace.members.filter(isActiveStaff));
  return (
    <>
      <fieldset className={styles.people} disabled={disabled}>
        <legend>Wessen Termine?</legend>
        <div className={styles.modes}>
          {(
            [
              ["mine", "Nur ich"],
              ["people", "Personen auswählen"],
              ["team", "Ganzes Team"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode}>
              <input
                type="radio"
                name="google-calendar-scope"
                value={mode}
                checked={selection.mode === mode}
                onChange={() => onChange({ ...selection, mode })}
              />
              {label}
            </label>
          ))}
        </div>
        {selection.mode === "people" && (
          <div className={styles.members}>
            {staff.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={selection.memberIds.includes(member.id)}
                  onChange={(event) =>
                    onChange({
                      ...selection,
                      memberIds: event.target.checked
                        ? [...selection.memberIds, member.id]
                        : selection.memberIds.filter((id) => id !== member.id),
                    })
                  }
                />
                {member.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <details
        className={styles.filters}
        open={Boolean(selection.productionId || selection.category) || undefined}
      >
        <summary>Produktion oder Kalenderart eingrenzen</summary>
        <div className={styles.filterFields}>
          <label>
            Produktion
            <select
              disabled={disabled}
              value={selection.productionId || ""}
              onChange={(event) => onChange({ ...selection, productionId: event.target.value })}
            >
              <option value="">Alle Produktionen</option>
              {calendarProductionRecords(workspace).map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.data.title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kalenderart
            <select
              disabled={disabled}
              value={selection.category || ""}
              onChange={(event) => onChange({ ...selection, category: event.target.value })}
            >
              <option value="">Alle Kalenderarten</option>
              {calendarCategories(workspace).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {initialSelection && (
        <Button disabled={disabled} onClick={() => onChange(initialSelection)}>
          <CalendarDays size={16} />
          Aktuelle Kalenderauswahl übernehmen
        </Button>
      )}
    </>
  );
}
