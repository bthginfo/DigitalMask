"use client";
import { useState } from "react";
import type { DomainRecord } from "@/shared/contracts";
import { ids, value } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
export function ConversationEditor({
  record,
  initialMode = "direct",
  onClose,
  onSaved,
}: {
  record?: DomainRecord;
  initialMode?: "direct" | "group" | "team";
  onClose: () => void;
  onSaved: (record: DomainRecord) => void;
}) {
  const { workspace, save, busy } = useWorkspace();
  const [mode, setMode] = useState(value(record?.data || {}, "mode") || initialMode),
    [title, setTitle] = useState(value(record?.data || {}, "title")),
    [people, setPeople] = useState(
      ids(record?.data || {}, "participantIds").filter((id) => id !== workspace.user.id),
    ),
    [error, setError] = useState("");
  const members = workspace.members.filter(
    (member) =>
      member.id !== workspace.user.id && (isActiveStaff(member) || people.includes(member.id)),
  );
  const teamChannel = mode === "team";
  return (
    <Modal
      title={
        teamChannel
          ? record
            ? "Teamkanal bearbeiten"
            : "Teamkanal anlegen"
          : record
            ? "Privaten Chat bearbeiten"
            : "Privaten Chat starten"
      }
      onClose={onClose}
    >
      <form
        className="conversation-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            if (teamChannel && !title.trim())
              throw new Error("Bitte gib dem Teamkanal einen Namen.");
            if (!teamChannel && (!people.length || (mode === "direct" && people.length !== 1)))
              throw new Error(
                mode === "direct"
                  ? "Wähle genau eine weitere Person."
                  : "Wähle mindestens eine weitere Person.",
              );
            const saved = await save(
              "conversations",
              {
                title: title.trim(),
                mode,
                participantIds: teamChannel ? [] : [workspace.user.id, ...people],
              },
              record,
            );
            onSaved(saved);
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <p className="muted booking-intro">
          {teamChannel
            ? "Das ganze Maskenteam kann hier mitlesen und schreiben. Neue Teammitglieder sind automatisch dabei."
            : "Nur die Teilnehmenden können Nachrichten und Dateien dieses Chats lesen. Du bist automatisch dabei."}
        </p>
        {!teamChannel && (
          <fieldset className="booking-mode">
            <legend>Chatart</legend>
            <div className="feedback-type-options">
              <label>
                <input
                  type="radio"
                  name="chat-mode"
                  checked={mode === "direct"}
                  disabled={!!record}
                  onChange={() => {
                    setMode("direct");
                    setPeople(people.slice(0, 1));
                  }}
                />
                Direktchat
              </label>
              <label>
                <input
                  type="radio"
                  name="chat-mode"
                  checked={mode === "group"}
                  disabled={!!record}
                  onChange={() => setMode("group")}
                />
                Gruppe
              </label>
            </div>
          </fieldset>
        )}
        {(mode === "group" || teamChannel) && (
          <label>
            {teamChannel ? "Kanalname" : "Gruppenname (optional)"}
            <input
              required={teamChannel}
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                teamChannel
                  ? "Zum Beispiel Werkstatt oder Dienstplanung"
                  : "Zum Beispiel Frühdienst"
              }
            />
          </label>
        )}
        {!teamChannel && (
          <fieldset className="form-multi">
            <legend>{mode === "direct" ? "Mit wem möchtest du schreiben?" : "Teilnehmende"}</legend>
            {members.map((member) => (
              <label className="check-label" key={member.id}>
                <input
                  type={mode === "direct" ? "radio" : "checkbox"}
                  name="chat-person"
                  disabled={!!record && mode === "direct"}
                  checked={people.includes(member.id)}
                  onChange={(event) =>
                    setPeople(
                      mode === "direct"
                        ? [member.id]
                        : event.target.checked
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
          </fieldset>
        )}
        {record && mode === "direct" && (
          <p className="small muted">
            Die beiden Personen eines Direktchats bleiben fest zugeordnet.
          </p>
        )}
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || (teamChannel ? !title.trim() : !people.length)}
          >
            {record ? "Speichern" : teamChannel ? "Kanal anlegen" : "Chat starten"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
