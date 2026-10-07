"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LinkedText } from "@/components/linked-text";
import {
  FilePlus2,
  Download,
  Hash,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { api, dateLabel, initials, post, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import { useWorkspace } from "@/components/workspace-context";
import { LiveStatus } from "@/components/live-status";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { useChatRead } from "@/modules/notifications/use-chat-read";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DocumentAttachment } from "@/modules/documents/components/document-attachment";
import { NewDocumentDialog } from "@/modules/documents/components/new-document-dialog";
import { documentAccept } from "@/modules/documents/components/record-documents";
import { ChatActionMenu } from "./chat-action-menu";
const DocumentEditor = dynamic(() => import("@/modules/documents/components/document-editor"), {
  ssr: false,
});

export function ChatChannel({
  productionId = "",
  conversation,
  title,
  onManage,
  sidebarToggle,
  mobileChannelToggle,
  onCreatePrivate,
  onCreateTeam,
}: {
  productionId?: string;
  conversation?: DomainRecord;
  title: string;
  onManage?: () => void;
  sidebarToggle?: ReactNode;
  mobileChannelToggle?: ReactNode;
  onCreatePrivate?: () => void;
  onCreateTeam?: () => void;
}) {
  const { workspace, refresh, save, remove, busy } = useWorkspace();
  const conversationId = conversation?.id || "",
    archived = conversation?.data.archived === true;
  const [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<DomainRecord | null>(null),
    [editingText, setEditingText] = useState(""),
    [exporting, setExporting] = useState(false),
    [creatingDocument, setCreatingDocument] = useState(false),
    [openedDocument, setOpenedDocument] = useState<DomainRecord | null>(null);
  const messageList = useRef<HTMLDivElement>(null),
    messageHistory = useRef<HTMLDivElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    lastMessage = useRef("");
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const resize = () => {
      const input = messageInput.current;
      if (!input) return;
      if (!window.matchMedia("(max-width: 1100px)").matches) {
        input.style.removeProperty("height");
        return;
      }
      const panelHeight =
        input.closest(".chat-layout")?.getBoundingClientRect().height || window.innerHeight;
      const cap = Math.max(44, Math.min(120, panelHeight * 0.28));
      input.style.height = "auto";
      input.style.height = `${Math.min(cap, input.scrollHeight)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [text]);
  useChatRead(conversationId, productionId, bottom);
  const messages = useMemo(
    () =>
      workspace.records.messages
        .filter((message) =>
          conversationId
            ? message.data.conversationId === conversationId
            : !value(message.data, "conversationId") &&
              value(message.data, "productionId") === productionId,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [workspace.records.messages, conversationId, productionId],
  );
  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || latest.id === lastMessage.current) return;
    if (!lastMessage.current || latest.data.userId === workspace.user.id || nearBottom.current) {
      const list = messageList.current;
      if (list) list.scrollTop = list.scrollHeight;
    }
    lastMessage.current = latest.id;
  }, [messages, workspace.user.id]);
  useEffect(() => {
    const list = messageList.current;
    const history = messageHistory.current;
    if (!list || !history) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Fonts, pictures and the keyboard can resize an already-open history.
        // Keep the latest message visible without disturbing someone reading above.
        if (nearBottom.current) list.scrollTop = list.scrollHeight;
      });
    });
    observer.observe(list);
    observer.observe(history);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && !files.length) || sending || archived) return;
    setSending(true);
    setError("");
    try {
      const result = await post<DomainRecord | { record: DomainRecord }>("/api/records/messages", {
        data: {
          text: text.trim() || "Dateianhang",
          ...(conversationId ? { conversationId } : { productionId }),
          attachmentIds: [],
        },
      });
      const record = "record" in result ? result.record : result;
      for (const file of files) {
        const form = new FormData();
        form.append("file", await prepareUpload(file));
        form.append("recordKind", "messages");
        form.append("recordId", record.id);
        await api("/api/files", { method: "POST", body: form });
      }
      setText("");
      setFiles([]);
      await refresh();
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Nachricht konnte nicht gesendet werden",
      );
    } finally {
      setSending(false);
    }
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
    <section className="chat-main">
      <header className="chat-heading chat-mobile-heading">
        {mobileChannelToggle || <h2>{title}</h2>}
        <LiveStatus compact />
        <ChatActionMenu label="Chataktionen" icon={<MoreHorizontal size={21} aria-hidden="true" />}>
          {archived && <Badge>Archiviert</Badge>}
          <LiveStatus recovery />
          {onCreatePrivate && (
            <button type="button" onClick={onCreatePrivate}>
              <Plus size={17} />
              Privater Chat
            </button>
          )}
          {onCreateTeam && (
            <button type="button" onClick={onCreateTeam}>
              <Hash size={17} />
              Teamkanal anlegen
            </button>
          )}
          {onManage && (
            <button type="button" onClick={onManage}>
              <Users size={17} />
              Verwalten
            </button>
          )}
          <button type="button" onClick={() => setExporting(true)}>
            <Download size={17} />
            Chat exportieren
          </button>
          <Link
            href="/?module=help&guide=app-install"
            prefetch={false}
            onClick={(event) => {
              event.preventDefault();
              history.pushState({}, "", "/?module=help&guide=app-install");
              window.dispatchEvent(new PopStateEvent("popstate"));
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            Hilfe & App installieren
          </Link>
        </ChatActionMenu>
      </header>
      <header className="chat-heading chat-desktop-heading">
        {sidebarToggle}
        {conversation ? (
          conversation.data.mode === "team" ? (
            <Hash size={20} />
          ) : conversation.data.mode === "direct" ? (
            <MessageCircle size={20} />
          ) : (
            <Users size={20} />
          )
        ) : (
          <Hash size={20} />
        )}
        <div>
          <h2>{title}</h2>
          <span className="small muted">
            {conversation
              ? conversation.data.mode === "team"
                ? "Teamkanal · Für das ganze Maskenteam"
                : `${conversation.data.mode === "direct" ? "Direktchat" : "Gruppenchat"} · ${Array.isArray(conversation.data.participantIds) ? conversation.data.participantIds.length : 0} Teilnehmende · privat`
              : productionId
                ? "Produktionskanal · Gemeinsame Absprachen & Dateien"
                : "Teamkanal · Gemeinsame Absprachen & Dateien"}
          </span>
        </div>
        <div className="chat-heading-actions">
          {archived && <Badge>Archiviert</Badge>}
          <LiveStatus recovery />
          {onManage && <Button onClick={onManage}>Verwalten</Button>}
          <ExportButton onClick={() => setExporting(true)} />
        </div>
      </header>
      <div
        className="chat-messages"
        ref={messageList}
        onScroll={(event) => {
          const list = event.currentTarget;
          nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
        }}
      >
        <div ref={messageHistory} className="chat-message-history">
          {messages.length ? (
            messages.map((message) => {
              const member = workspace.members.find((person) => person.id === message.data.userId),
                own = message.data.userId === workspace.user.id;
              const attached = workspace.records.files.filter(
                (file) => file.data.recordKind === "messages" && file.data.recordId === message.id,
              );
              const attachmentIds = Array.isArray(message.data.attachmentIds)
                ? (message.data.attachmentIds as string[])
                : [];
              return (
                <article className={`chat-message ${own ? "own" : ""}`} key={message.id}>
                  <span className="avatar">{initials(member?.name || "Team")}</span>
                  <div className="message-content">
                    <header>
                      <strong>{member?.name || "Teammitglied"}</strong>
                      <time className="small muted" dateTime={message.createdAt}>
                        {dateLabel(message.createdAt, true)}
                      </time>
                      {message.version > 1 && <span className="small muted">bearbeitet</span>}
                    </header>
                    <p>
                      <LinkedText>{value(message.data, "text")}</LinkedText>
                    </p>
                    {attached.map((file) => (
                      <DocumentAttachment key={file.id} file={file} compact />
                    ))}
                    {attachmentIds
                      .filter((id) => !attached.some((file) => file.id === id))
                      .map((id, index) => (
                        <a
                          key={id}
                          href={`/api/files/${id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="message-attachment"
                        >
                          <Paperclip size={14} />
                          Anhang {index + 1}
                        </a>
                      ))}
                    {own && !archived && (
                      <div className="message-actions">
                        <button
                          className="icon-button"
                          aria-label={`Nachricht von ${dateLabel(message.createdAt, true)} bearbeiten`}
                          disabled={sending || busy}
                          onClick={() => {
                            setEditing(message);
                            setEditingText(value(message.data, "text"));
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Nachricht von ${dateLabel(message.createdAt, true)} löschen`}
                          disabled={sending || busy}
                          onClick={() => {
                            if (confirm("Eigene Nachricht löschen?"))
                              void update(() => remove(message));
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <Empty
              title="Ein neuer Raum für eure Absprachen."
              description={
                conversation && conversation.data.mode !== "team"
                  ? "Schreibe nur den Teilnehmenden dieses Chats. Nachrichten und Dateien bleiben hier."
                  : "Teile Informationen, stelle Fragen oder hänge eine Datei an."
              }
            />
          )}
          <div ref={bottom} />
        </div>
      </div>
      {archived ? (
        <div className="chat-archived-note">
          Dieser Chat ist archiviert. Der Verlauf bleibt lesbar; neue Nachrichten sind gesperrt.
        </div>
      ) : (
        <form className="chat-composer" onSubmit={send}>
          <div className="chat-composer-notices">
            {files.length > 0 && (
              <div className="pending-files">
                {files.map((file, index) => (
                  <span key={`${file.name}:${index}`}>
                    <Paperclip size={13} />
                    {file.name}
                    <button
                      type="button"
                      aria-label={`Anhang ${file.name} entfernen`}
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <ErrorMessage message={error} />
          </div>
          <label className="visually-hidden" htmlFor="message">
            Nachricht an {title}
          </label>
          <div className="chat-input-row">
            <ChatActionMenu
              label="Anhänge und Dokumente"
              icon={<Plus size={21} aria-hidden="true" />}
              className="chat-attachment-menu"
              disabled={sending}
            >
              <button type="button" onClick={() => fileInput.current?.click()} disabled={sending}>
                <Paperclip size={18} />
                Datei anhängen
              </button>
              <button type="button" onClick={() => setCreatingDocument(true)} disabled={sending}>
                <FilePlus2 size={18} />
                Gemeinsames Dokument anlegen
              </button>
            </ChatActionMenu>
            <textarea
              id="message"
              ref={messageInput}
              rows={1}
              required={!files.length}
              value={text}
              disabled={sending}
              placeholder="Nachricht schreiben …"
              onChange={(event) => setText(event.target.value)}
            />
            <button
              type="submit"
              className="chat-compact-button chat-mobile-send"
              aria-label={sending ? "Sendet …" : "Senden"}
              title="Nachricht senden"
              disabled={sending || (!text.trim() && !files.length)}
            >
              <Send size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="composer-actions">
            <label className="button ghost">
              <Paperclip size={17} />
              Datei
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept={documentAccept}
                multiple
                disabled={sending}
                onChange={(event) => setFiles([...files, ...Array.from(event.target.files || [])])}
              />
            </label>
            <Button
              title="Gemeinsames Dokument anlegen"
              disabled={sending}
              onClick={() => setCreatingDocument(true)}
            >
              <FilePlus2 size={16} />{" "}
              <span>
                <span className="chat-document-prefix">Gemeinsames </span>Dokument
              </span>
            </Button>
            <span className="small muted">
              {conversation && conversation.data.mode !== "team"
                ? "Nur die Teilnehmenden haben Zugriff."
                : "Nur das Team hat Zugriff."}
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={sending || (!text.trim() && !files.length)}
            >
              <Send size={16} />
              {sending ? "Sendet …" : "Senden"}
            </Button>
          </div>
        </form>
      )}
      {editing && (
        <Modal title="Eigene Nachricht bearbeiten" onClose={() => setEditing(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void update(async () => {
                await save("messages", { text: editingText.trim() }, editing);
                setEditing(null);
              });
            }}
          >
            <label htmlFor="edited-message">Nachricht</label>
            <textarea
              id="edited-message"
              rows={5}
              required
              maxLength={10000}
              value={editingText}
              onChange={(event) => setEditingText(event.target.value)}
            />
            <ErrorMessage message={error} />
            <footer className="dialog-footer">
              <Button onClick={() => setEditing(null)}>Abbrechen</Button>
              <Button type="submit" variant="primary" disabled={busy || !editingText.trim()}>
                Speichern
              </Button>
            </footer>
          </form>
        </Modal>
      )}
      {creatingDocument && (
        <NewDocumentDialog
          onClose={() => setCreatingDocument(false)}
          onCreate={async (name, format) => {
            const result = await post<DomainRecord | { record: DomainRecord }>(
              "/api/records/messages",
              {
                data: {
                  text: name,
                  ...(conversationId ? { conversationId } : { productionId }),
                  attachmentIds: [],
                },
              },
            );
            const message = "record" in result ? result.record : result;
            let file: DomainRecord;
            try {
              file = await post<DomainRecord>("/api/documents", {
                recordKind: "messages",
                recordId: message.id,
                name,
                format,
              });
            } catch (exception) {
              await remove(message).catch(() => {});
              throw exception;
            }
            await refresh();
            setCreatingDocument(false);
            setOpenedDocument(file);
          }}
        />
      )}
      {openedDocument && (
        <DocumentEditor file={openedDocument} onClose={() => setOpenedDocument(null)} />
      )}
      {exporting && (
        <ExportDialog
          kind="messages"
          filters={
            conversationId
              ? { conversationId }
              : productionId
                ? { productionId }
                : { generalOnly: "true" }
          }
          onClose={() => setExporting(false)}
        />
      )}
    </section>
  );
}
