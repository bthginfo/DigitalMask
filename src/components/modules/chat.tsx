"use client";
import { useState } from "react";
import { Hash, Plus, Users } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { ids, value } from "@/shared/client-api";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal, PageHeader } from "../ui";
import { ChatChannel } from "@/modules/chat/components/chat-channel";
import { ConversationEditor } from "@/modules/chat/components/conversation-editor";

export function conversationTitle(
  record: DomainRecord,
  members: { id: string; name: string }[],
  self: string,
) {
  return (
    value(record.data, "title") ||
    ids(record.data, "participantIds")
      .filter((id) => id !== self)
      .map((id) => members.find((person) => person.id === id)?.name || "Ehemaliges Teammitglied")
      .join(", ") ||
    "Privater Chat"
  );
}
export function ChatModule({
  productionId = "",
  conversationId = "",
  onNavigate,
}: {
  productionId?: string;
  conversationId?: string;
  onNavigate?: (conversationId: string, productionId?: string) => void;
}) {
  const { workspace, save, remove, busy } = useWorkspace();
  const [selection, setSelection] = useState({ conversationId, productionId });
  const [editor, setEditor] = useState<DomainRecord | "new" | null>(null),
    [manage, setManage] = useState(false),
    [archived, setArchived] = useState(false),
    [error, setError] = useState("");
  const locked = !!productionId && !onNavigate;
  const selectedConversation = onNavigate ? conversationId : selection.conversationId,
    selectedProduction = locked ? productionId : onNavigate ? productionId : selection.productionId;
  const visibleConversations = (workspace.records.conversations || []).filter((record) =>
    ids(record.data, "participantIds").includes(workspace.user.id),
  );
  const conversation = visibleConversations.find((record) => record.id === selectedConversation);
  const title = conversation
    ? conversationTitle(conversation, workspace.members, workspace.user.id)
    : selectedProduction
      ? value(
          workspace.records.productions.find((record) => record.id === selectedProduction)?.data ||
            {},
          "title",
        )
      : "Maske · Allgemein";
  const choose = (id: string, project = "") => {
    setManage(false);
    setError("");
    if (onNavigate) onNavigate(id, project);
    else setSelection({ conversationId: id, productionId: project });
  };
  const update = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Aktion fehlgeschlagen");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="KURZE WEGE. GUTE ABSPRACHEN."
        title={locked ? "Projektchat" : "Kommunikation"}
        description={
          locked
            ? "Alles zum Stück an einem gemeinsamen Ort."
            : "Allgemeine Informationen, Projektkanäle und private Gespräche."
        }
      >
        {!locked && (
          <Button variant="primary" onClick={() => setEditor("new")}>
            <Plus size={16} />
            Privater Chat
          </Button>
        )}
      </PageHeader>
      <div className={locked ? "chat-layout single-channel" : "chat-layout"}>
        {!locked && (
          <aside className="chat-channels" aria-label="Chats auswählen">
            <div className="chat-channel-group">
              <h3>Gemeinsame Kanäle</h3>
              <button
                className={!selectedConversation && !selectedProduction ? "active" : ""}
                aria-current={!selectedConversation && !selectedProduction ? "page" : undefined}
                onClick={() => choose("")}
              >
                <Hash size={16} />
                Maske · Allgemein
              </button>
              {workspace.records.productions
                .filter((record) => record.data.status !== "archived")
                .map((record) => (
                  <button
                    key={record.id}
                    className={
                      !selectedConversation && selectedProduction === record.id ? "active" : ""
                    }
                    aria-current={
                      !selectedConversation && selectedProduction === record.id ? "page" : undefined
                    }
                    onClick={() => choose("", record.id)}
                  >
                    <Hash size={16} />
                    {value(record.data, "title")}
                  </button>
                ))}
            </div>
            <div className="chat-channel-group">
              <h3>Private Chats</h3>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={archived}
                  onChange={(event) => setArchived(event.target.checked)}
                />
                Archivierte einblenden
              </label>
              {workspace.records.conversations
                ?.filter((record) => archived || record.data.archived !== true)
                .map((record) => (
                  <button
                    key={record.id}
                    className={selectedConversation === record.id ? "active" : ""}
                    aria-current={selectedConversation === record.id ? "page" : undefined}
                    onClick={() => choose(record.id)}
                  >
                    <Users size={16} />
                    <span>
                      {conversationTitle(record, workspace.members, workspace.user.id)}
                      {record.data.archived === true && (
                        <span className="small muted"> · archiviert</span>
                      )}
                    </span>
                  </button>
                ))}
              {!visibleConversations.length && (
                <p className="small muted">
                  Beginne einen Chat mit einer Person oder einer Gruppe.
                </p>
              )}
            </div>
          </aside>
        )}
        {selectedConversation && !conversation ? (
          <Empty
            title="Dieser Chat ist nicht verfügbar."
            description="Wähle einen anderen Chat aus deinen freigegebenen Gesprächen."
          />
        ) : (
          <ChatChannel
            key={selectedConversation || `production:${selectedProduction}`}
            title={title}
            productionId={selectedProduction}
            conversation={conversation}
            onManage={
              conversation?.createdBy === workspace.user.id ? () => setManage(true) : undefined
            }
          />
        )}
      </div>
      {manage && conversation && (
        <Modal title="Privaten Chat verwalten" onClose={() => setManage(false)}>
          <p className="help-note">
            Nur die Teilnehmenden können den Verlauf und Dateien sehen. Entfernte Personen verlieren
            den Zugriff.
          </p>
          <h3>{title}</h3>
          <p>
            {ids(conversation.data, "participantIds")
              .map(
                (id) =>
                  workspace.members.find((person) => person.id === id)?.name ||
                  "Ehemaliges Teammitglied",
              )
              .join(", ")}
          </p>
          {conversation.data.archived === true && <Badge>Archiviert</Badge>}
          <ErrorMessage message={error} />
          <footer className="dialog-footer">
            <Button
              disabled={busy}
              onClick={() => {
                setManage(false);
                setEditor(conversation);
              }}
            >
              Bearbeiten
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void update(async () => {
                  await save(
                    "conversations",
                    { archived: conversation.data.archived !== true },
                    conversation,
                  );
                  setManage(false);
                })
              }
            >
              {conversation.data.archived === true ? "Chat wieder öffnen" : "Archivieren"}
            </Button>
            <Button
              variant="danger-ghost"
              disabled={busy}
              onClick={() => {
                if (confirm("Leeren Chat löschen? Chats mit Nachrichten können archiviert werden."))
                  void update(async () => {
                    await remove(conversation);
                    choose("");
                  });
              }}
            >
              Löschen
            </Button>
          </footer>
        </Modal>
      )}
      {editor && (
        <ConversationEditor
          record={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={(record) => choose(record.id)}
        />
      )}
    </>
  );
}
