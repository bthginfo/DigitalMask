"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Paperclip, Pencil, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { api, ApiFailure, dateLabel, initials, post, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";

export function ChatChannel({
  productionId = "",
  conversation,
  title,
  onManage,
}: {
  productionId?: string;
  conversation?: DomainRecord;
  title: string;
  onManage?: () => void;
}) {
  const { workspace, mergeMessages, refresh, save, remove, busy } = useWorkspace();
  const conversationId = conversation?.id || "",
    archived = conversation?.data.archived === true;
  const [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [pollError, setPollError] = useState(false),
    [denied, setDenied] = useState(false),
    [editing, setEditing] = useState<DomainRecord | null>(null),
    [editingText, setEditingText] = useState(""),
    [exporting, setExporting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null),
    after = useRef("");
  const merge = useRef(mergeMessages),
    reload = useRef(refresh);
  useEffect(() => {
    merge.current = mergeMessages;
    reload.current = refresh;
  }, [mergeMessages, refresh]);
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
    after.current = messages.reduce(
      (latest, message) => (message.updatedAt > latest ? message.updatedAt : latest),
      "",
    );
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  useEffect(() => {
    let stopped = false,
      delay = 30000,
      timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const active = () =>
      document.visibilityState === "visible" && document.hasFocus() && navigator.onLine;
    const stopTimer = () => {
      if (timeout) clearTimeout(timeout);
    };
    const poll = async () => {
      if (stopped || !active()) return;
      if (!document.querySelector("dialog[open]"))
        try {
          const query = new URLSearchParams({
            ...(conversationId
              ? { conversationId }
              : productionId
                ? { productionId }
                : { generalOnly: "true" }),
            ...(after.current ? { after: after.current } : {}),
          });
          const result = await api<{ messages: DomainRecord[] }>(`/api/messages?${query}`, {
            signal: controller.signal,
          });
          if (!stopped) {
            merge.current(result.messages);
            after.current = result.messages.reduce(
              (latest, message) => (message.updatedAt > latest ? message.updatedAt : latest),
              after.current,
            );
            setPollError(false);
            delay = 30000;
          }
        } catch (exception) {
          if (!stopped) {
            if (
              exception instanceof ApiFailure &&
              (exception.status === 403 || exception.status === 404)
            ) {
              setDenied(true);
              stopped = true;
              void reload.current();
              return;
            }
            setPollError(true);
            delay = Math.min(delay * 2, 300000);
          }
        }
      if (!stopped && active()) timeout = setTimeout(() => void poll(), delay);
    };
    const resume = () => {
      stopTimer();
      if (!stopped && active()) timeout = setTimeout(() => void poll(), after.current ? delay : 0);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("blur", stopTimer);
    window.addEventListener("online", resume);
    window.addEventListener("offline", stopTimer);
    resume();
    return () => {
      stopped = true;
      controller.abort();
      stopTimer();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("blur", stopTimer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", stopTimer);
    };
  }, [conversationId, productionId]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && !files.length) || sending || archived || denied) return;
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
  if (denied)
    return (
      <Empty
        title="Dieser Chat ist nicht mehr für dich verfügbar."
        description="Deine Teilnahme hat sich geändert. Wähle einen anderen Chat."
      />
    );
  return (
    <section className="chat-main">
      <header className="chat-heading">
        {conversation ? <Users size={20} /> : <Hash size={20} />}
        <div>
          <h2>{title}</h2>
          <span className="small muted">
            {conversation
              ? `${Array.isArray(conversation.data.participantIds) ? conversation.data.participantIds.length : 0} Teilnehmende · privat`
              : "Gemeinsame Absprachen & Dateien"}
          </span>
        </div>
        <div className="chat-heading-actions">
          {archived && <Badge>Archiviert</Badge>}
          {pollError && <Badge tone="coral">Verbindung wird erneut geprüft</Badge>}
          <button
            className="icon-button"
            disabled={sending || busy}
            aria-label="Chat aktualisieren"
            onClick={() => void update(refresh)}
          >
            <RefreshCw size={17} />
          </button>
          {onManage && <Button onClick={onManage}>Verwalten</Button>}
          <ExportButton onClick={() => setExporting(true)} />
        </div>
      </header>
      <div className="chat-messages">
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
                  <p>{value(message.data, "text")}</p>
                  {attached.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="message-attachment"
                    >
                      <Paperclip size={14} />
                      {value(file.data, "name")}
                    </a>
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
              conversation
                ? "Schreibe nur den Teilnehmenden dieses Chats. Nachrichten und Dateien bleiben hier."
                : "Teile Informationen, stelle Fragen oder hänge eine Datei an."
            }
          />
        )}
        <div ref={bottom} />
      </div>
      {archived ? (
        <div className="chat-archived-note">
          Dieser Chat ist archiviert. Der Verlauf bleibt lesbar; neue Nachrichten sind gesperrt.
        </div>
      ) : (
        <form className="chat-composer" onSubmit={send}>
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
          <label className="visually-hidden" htmlFor="message">
            Nachricht an {title}
          </label>
          <textarea
            id="message"
            rows={2}
            required={!files.length}
            value={text}
            disabled={sending}
            placeholder={`Nachricht an ${title} …`}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="composer-actions">
            <label className="button ghost">
              <Paperclip size={17} />
              Datei
              <input
                className="visually-hidden"
                type="file"
                multiple
                disabled={sending}
                onChange={(event) => setFiles([...files, ...Array.from(event.target.files || [])])}
              />
            </label>
            <span className="small muted">
              {conversation ? "Nur die Teilnehmenden haben Zugriff." : "Nur das Team hat Zugriff."}
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
