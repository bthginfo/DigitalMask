"use client";
import { LinkedText } from "@/components/linked-text";
import { useState } from "react";
import { Clock3, MapPin, Pencil, Trash2, Users } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { calendarPresentation } from "@/shared/calendar-categories";
import { dateLabel, ids, instantDate, localDate, shiftDate, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { TimeBookingEditor } from "@/modules/time-tracking/components/time-booking-editor";
import { EventEditor } from "./event-editor";
import { canManageRecord } from "@/shared/record-permissions";
import { RecordLink } from "@/components/record-link";
export function EventDetail({
  record,
  onClose,
  onNavigate = onClose,
}: {
  record: DomainRecord;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const { workspace, remove, busy } = useWorkspace();
  const [editing, setEditing] = useState(false),
    [booking, setBooking] = useState(false),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const current = workspace.records.events.find((row) => row.id === record.id) || record;
  const presentation = calendarPresentation(
    current,
    workspace.records.productions,
    workspace.records.calendarCategories,
  );
  const canEdit = canManageRecord(workspace.user, "events", current);
  const production = workspace.records.productions.find(
    (row) => row.id === current.data.productionId,
  );
  const endDay = shiftDate(localDate(instantDate(value(current.data, "end"))), -1);
  return (
    <>
      {editing ? (
        <EventEditor record={current} onClose={() => setEditing(false)} />
      ) : (
        <Modal title={presentation.title} onClose={onClose} wide>
          <div className="detail-actions">
            <Badge>
              {presentation.categoryName}
              {presentation.allDay ? " · ganztägig" : ""}
            </Badge>
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil size={15} />
                Bearbeiten
              </Button>
            )}
            <ExportButton onClick={() => setExporting(true)} />
            {canEdit && (
              <Button
                variant="danger-ghost"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Termin „${presentation.title}“ löschen?`)) {
                    setError("");
                    void remove(current)
                      .then(onClose)
                      .catch((exception) =>
                        setError(
                          exception instanceof Error ? exception.message : "Löschen fehlgeschlagen",
                        ),
                      );
                  }
                }}
              >
                <Trash2 size={15} />
                Löschen
              </Button>
            )}
          </div>
          <dl className="detail-grid event-detail-grid">
            <div>
              <dt>
                <Clock3 size={14} />
                Zeitraum
              </dt>
              <dd>
                {presentation.allDay
                  ? `${dateLabel(localDate(instantDate(value(current.data, "start"))))} – ${dateLabel(endDay)} · ganztägig`
                  : `${dateLabel(value(current.data, "start"), true)} – ${dateLabel(value(current.data, "end"), true)}`}
              </dd>
            </div>
            <div>
              <dt>Produktion</dt>
              <dd>
                {production ? (
                  <RecordLink record={production} from={current} onNavigate={onNavigate}>
                    {value(production.data, "title")}
                  </RecordLink>
                ) : (
                  "Ohne Produktion"
                )}
              </dd>
            </div>
            <div>
              <dt>
                <MapPin size={14} />
                Ort
              </dt>
              <dd>
                <LinkedText>
                  {value(current.data, "location") || "Noch kein Ort eingetragen"}
                </LinkedText>
              </dd>
            </div>
            <div>
              <dt>
                <Users size={14} />
                Personen
              </dt>
              <dd>
                {ids(current.data, "participantIds")
                  .map(
                    (id) =>
                      workspace.members.find((member) => member.id === id)?.name ||
                      "Ehemaliges Teammitglied",
                  )
                  .join(", ") || "Gäste/Aushilfen"}
              </dd>
            </div>
          </dl>
          {presentation.background && (
            <p className="help-note">
              {presentation.background === "service"
                ? "Arbeitszeit im Hintergrund. Weitere Termine können innerhalb dieses Dienstes liegen. Zum Ändern nutze Bearbeiten."
                : "Hinweis auf einen halben freien Tag. Weitere Termine bleiben möglich."}
            </p>
          )}
          {!!current.data.recurrence && current.data.recurrence !== "none" && (
            <p className="help-note">
              Terminserie · {current.data.recurrence === "weekly" ? "wöchentlich" : "täglich"} bis{" "}
              {dateLabel(value(current.data, "until"))}. Die Bearbeitung ändert die ganze Serie.
            </p>
          )}
          {!!current.data.leaveId && (
            <p className="help-note">
              Dieser Termin gehört zu einem genehmigten Freiwunsch. Änderungen laufen über die
              Freiwunschverwaltung.
            </p>
          )}
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            {workspace.user.role !== "superadmin" && (
              <Button onClick={() => setBooking(true)}>Tatsächliche Arbeitszeit buchen</Button>
            )}
            <Button onClick={onClose}>Schließen</Button>
          </footer>
        </Modal>
      )}
      {booking && (
        <TimeBookingEditor
          defaults={{
            title: presentation.title,
            productionId: value(current.data, "productionId"),
            date: localDate(),
            category: current.data.productionId ? "production" : "other",
          }}
          onClose={() => setBooking(false)}
        />
      )}{" "}
      {exporting && (
        <ExportDialog
          kind="events"
          filters={{ id: current.id }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
