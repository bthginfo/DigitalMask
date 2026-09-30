"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Paperclip, Send, X } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { api, dateLabel, initials, post, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ErrorMessage, PageHeader } from "../ui";
export function ChatModule() {
  const { workspace, mergeMessages, refresh } = useWorkspace();
  const [channel, setChannel] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const after = useRef("");
  const merge = useRef(mergeMessages);
  useEffect(() => {
    merge.current = mergeMessages;
  }, [mergeMessages]);
  const messages = useMemo(
    () =>
      workspace.records.messages
        .filter((x) => value(x.data, "productionId") === channel)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [workspace.records.messages, channel],
  );
  useEffect(() => {
    after.current = messages.reduce(
      (latest, message) => (message.updatedAt > latest ? message.updatedAt : latest),
      "",
    );
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    let delay = 30000;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && document.hasFocus() && navigator.onLine) {
        try {
          const query = new URLSearchParams({
            productionId: channel,
            ...(after.current ? { after: after.current } : {}),
          });
          const result = await api<{ messages: DomainRecord[] }>(`/api/messages?${query}`);
          if (!stopped) {
            merge.current(result.messages);
            after.current = result.messages.reduce(
              (latest, message) => (message.updatedAt > latest ? message.updatedAt : latest),
              after.current,
            );
            setPollError(false);
            delay = 30000;
          }
        } catch {
          if (!stopped) {
            setPollError(true);
            delay = Math.min(delay * 2, 300000);
          }
        }
      }
      if (!stopped) timeout = setTimeout(() => void poll(), delay);
    };
    timeout = setTimeout(() => void poll(), after.current ? delay : 0);
    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, [channel]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && !files.length) || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await post<DomainRecord | { record: DomainRecord }>("/api/records/messages", {
        data: { text: text.trim() || "Dateianhang", productionId: channel, attachmentIds: [] },
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nachricht konnte nicht gesendet werden");
    } finally {
      setSending(false);
    }
  };
  const title = channel
    ? value(workspace.records.productions.find((x) => x.id === channel)?.data || {}, "title")
    : "Maske · Allgemein";
  return (
    <>
      <PageHeader
        eyebrow="KURZE WEGE IM TEAM"
        title="Kommunikation"
        description="Absprachen zu Produktionen und alles, was die ganze Maske betrifft."
      />
      <div className="chat-layout">
        <aside className="chat-channels">
          <p className="eyebrow">ABTEILUNG</p>
          <button className={channel === "" ? "active" : ""} onClick={() => setChannel("")}>
            <Hash size={17} />
            Maske · Allgemein
          </button>
          <p className="eyebrow">PRODUKTIONEN</p>
          {workspace.records.productions
            .filter((x) => x.data.status !== "archived")
            .map((x) => (
              <button
                key={x.id}
                className={channel === x.id ? "active" : ""}
                onClick={() => setChannel(x.id)}
              >
                <Hash size={17} />
                {value(x.data, "title")}
              </button>
            ))}
          {!workspace.records.productions.length && (
            <p className="small muted">Projektchats entstehen mit euren Produktionen.</p>
          )}
        </aside>
        <section className="chat-main">
          <header className="chat-heading">
            <Hash size={20} />
            <div>
              <h2>{title}</h2>
              <span className="small muted">Gemeinsame Absprachen & Dateien</span>
            </div>
            {pollError && <Badge tone="coral">Verbindung wird erneut geprüft</Badge>}
          </header>
          <div className="chat-messages">
            {messages.length ? (
              messages.map((message) => {
                const member = workspace.members.find((x) => x.id === message.data.userId);
                const attached = workspace.records.files.filter(
                  (file) =>
                    file.data.recordKind === "messages" && file.data.recordId === message.id,
                );
                const unknownAttachments = (
                  Array.isArray(message.data.attachmentIds)
                    ? (message.data.attachmentIds as string[])
                    : []
                ).filter((id) => !attached.some((file) => file.id === id));
                return (
                  <article
                    className={`chat-message ${message.data.userId === workspace.user.id ? "own" : ""}`}
                    key={message.id}
                  >
                    <span className="avatar">{initials(member?.name || "Team")}</span>
                    <div className="message-content">
                      <header>
                        <strong>{member?.name || "Teammitglied"}</strong>
                        <time className="small muted" dateTime={message.createdAt}>
                          {dateLabel(message.createdAt, true)}
                        </time>
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
                      {unknownAttachments.map((id, index) => (
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
                    </div>
                  </article>
                );
              })
            ) : (
              <Empty
                title="Ein neuer Raum für eure Absprachen."
                description="Teile Informationen, stelle Fragen oder hänge eine Datei an. Nachrichten bleiben im jeweiligen Kanal."
              />
            )}
            <div ref={bottom} />
          </div>
          <form className="chat-composer" onSubmit={send}>
            {files.length > 0 && (
              <div className="pending-files">
                {files.map((file, i) => (
                  <span key={`${file.name}-${i}`}>
                    <Paperclip size={13} />
                    {file.name}
                    <button
                      type="button"
                      aria-label="Anhang entfernen"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
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
              placeholder={`Nachricht an ${title} …`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              required={!files.length}
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
                  onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])}
                />
              </label>
              <span className="small muted">Nur das Team hat Zugriff.</span>
              <Button
                variant="primary"
                type="submit"
                disabled={sending || (!text.trim() && !files.length)}
              >
                <Send size={16} />
                {sending ? "Sendet …" : "Senden"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
