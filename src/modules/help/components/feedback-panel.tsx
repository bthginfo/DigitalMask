"use client";
import { LinkedText } from "@/components/linked-text";
import { useState } from "react";
import { ArrowUpRight, Bug, Lightbulb, Plus } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { dateLabel, value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal } from "@/components/ui";

export const feedbackStatuses: Record<string, string> = {
  new: "Neu",
  review: "In Prüfung",
  planned: "Geplant",
  doing: "In Arbeit",
  done: "Umgesetzt",
  closed: "Abgeschlossen",
};
function FeedbackEditor({ record, onClose }: { record?: DomainRecord; onClose: () => void }) {
  const { save, busy } = useWorkspace();
  const [type, setType] = useState(value(record?.data || {}, "type") || "feature");
  const [title, setTitle] = useState(value(record?.data || {}, "title"));
  const [description, setDescription] = useState(value(record?.data || {}, "description"));
  const [error, setError] = useState("");
  return (
    <Modal title={record ? "Rückmeldung bearbeiten" : "Idee oder Fehler melden"} onClose={onClose}>
      <form
        className="feedback-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await save(
              "feedback",
              { type, title: title.trim(), description: description.trim() },
              record,
            );
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Senden fehlgeschlagen");
          }
        }}
      >
        <fieldset className="feedback-types">
          <legend>Art der Rückmeldung</legend>
          <div className="feedback-type-options">
            <label>
              <input
                type="radio"
                name="feedback-type"
                value="feature"
                checked={type === "feature"}
                onChange={() => setType("feature")}
              />
              <Lightbulb size={18} />
              Idee / Wunsch
            </label>
            <label>
              <input
                type="radio"
                name="feedback-type"
                value="bug"
                checked={type === "bug"}
                onChange={() => setType("bug")}
              />
              <Bug size={18} />
              Fehler
            </label>
          </div>
        </fieldset>
        <label>
          Titel
          <input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              type === "bug" ? "Was funktioniert nicht?" : "Was würde eure Arbeit erleichtern?"
            }
          />
        </label>
        <label>
          Beschreibung
          <textarea
            required
            maxLength={10000}
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              type === "bug"
                ? "In welchem Bereich? Welche Schritte hast du ausgeführt? Was ist passiert und was hast du erwartet?"
                : "Beschreibe deinen Wunsch und wofür du ihn im Arbeitsalltag brauchst."
            }
          />
        </label>
        <p className="small muted">
          Deine Rückmeldung und ihr Bearbeitungsstatus sind für dich und den Superadmin einsehbar.
          Bitte trage hier keine Passwörter oder sensiblen Angaben zu Personen ein.
        </p>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Wird gespeichert …" : record ? "Änderungen speichern" : "Rückmeldung senden"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export function FeedbackPanel() {
  const { workspace, save, busy } = useWorkspace();
  const superadmin = workspace.user.role === "superadmin";
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DomainRecord | undefined>();
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const records = workspace.records.feedback
    .filter(
      (record) =>
        (superadmin || record.data.userId === workspace.user.id) &&
        (!status || record.data.status === status) &&
        (!type || record.data.type === type),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const current = detail
    ? workspace.records.feedback.find((record) => record.id === detail.id) || detail
    : null;
  const updateStatus = async (record: DomainRecord, status: string) => {
    setError("");
    try {
      await save("feedback", { status }, record);
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Status konnte nicht geändert werden.",
      );
    }
  };
  return (
    <>
      <div className="feedback-heading">
        <div>
          <h2>{superadmin ? "Bearbeitungsübersicht" : "Meine Rückmeldungen"}</h2>
          <p className="muted">
            {superadmin
              ? "Ideen und Fehlerberichte aus dem Team prüfen, planen und abschließen."
              : "Deine Ideen und Fehlerberichte mit aktuellem Bearbeitungsstand."}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Idee oder Fehler melden
        </Button>
      </div>
      <div className="toolbar wrap">
        <label className="inline-label">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Alle Status</option>
            {Object.entries(feedbackStatuses).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-label">
          Art
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Ideen & Fehler</option>
            <option value="feature">Ideen / Wünsche</option>
            <option value="bug">Fehler</option>
          </select>
        </label>
        <span className="small muted">{records.length} Rückmeldungen</span>
      </div>
      <ErrorMessage message={error} />
      {records.length ? (
        <div className="feedback-list">
          {records.map((record) => (
            <article className="feedback-row" key={record.id}>
              <span
                className={`feedback-type-icon ${record.data.type === "bug" ? "bug" : ""}`}
                aria-hidden="true"
              >
                {record.data.type === "bug" ? <Bug size={20} /> : <Lightbulb size={20} />}
              </span>
              <div className="feedback-row-content">
                <button className="text-button strong" onClick={() => setDetail(record)}>
                  {value(record.data, "title")}
                  <ArrowUpRight size={14} />
                </button>
                <p className="small muted">
                  {record.data.type === "bug" ? "Fehler" : "Idee / Wunsch"} ·{" "}
                  {dateLabel(record.createdAt)}
                  {superadmin
                    ? ` · ${workspace.members.find((member) => member.id === record.data.userId)?.name || "Teammitglied"}`
                    : ""}
                </p>
                <p className="feedback-excerpt">
                  <LinkedText>{value(record.data, "description")}</LinkedText>
                </p>
              </div>
              {superadmin ? (
                <select
                  aria-label={`Status von ${value(record.data, "title")}`}
                  value={value(record.data, "status")}
                  disabled={busy}
                  onChange={(event) => void updateStatus(record, event.target.value)}
                >
                  {Object.entries(feedbackStatuses).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge tone={record.data.status === "done" ? "green" : "neutral"}>
                  {feedbackStatuses[value(record.data, "status")] || "Neu"}
                </Badge>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            status || type
              ? "Keine passenden Rückmeldungen."
              : "Deine Erfahrung macht DigitalMask besser."
          }
          description={
            status || type
              ? "Passe die Filter an, um weitere Rückmeldungen zu sehen."
              : "Teile eine Idee oder beschreibe einen Fehler. Der Bearbeitungsstand bleibt hier nachvollziehbar."
          }
          action="Rückmeldung schreiben"
          onAction={() => setCreating(true)}
        />
      )}
      {creating && <FeedbackEditor onClose={() => setCreating(false)} />}
      {editing && <FeedbackEditor record={editing} onClose={() => setEditing(undefined)} />}
      {current && !editing && (
        <Modal title={value(current.data, "title")} onClose={() => setDetail(null)}>
          <div className="feedback-detail">
            <Badge tone={current.data.status === "done" ? "green" : "neutral"}>
              {feedbackStatuses[value(current.data, "status")] || "Neu"}
            </Badge>
            <p className="small muted">
              {current.data.type === "bug" ? "Fehler" : "Idee / Wunsch"} ·{" "}
              {dateLabel(current.createdAt, true)}
            </p>
            <p className="feedback-description">
              <LinkedText>{value(current.data, "description")}</LinkedText>
            </p>
            {superadmin && (
              <label>
                Bearbeitungsstatus
                <select
                  value={value(current.data, "status")}
                  disabled={busy}
                  onChange={(event) => void updateStatus(current, event.target.value)}
                >
                  {Object.entries(feedbackStatuses).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ErrorMessage message={error} />
          </div>
          <footer className="dialog-footer">
            {current.data.userId === workspace.user.id && (
              <Button onClick={() => setEditing(current)}>Rückmeldung bearbeiten</Button>
            )}
            <Button onClick={() => setDetail(null)}>Schließen</Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
