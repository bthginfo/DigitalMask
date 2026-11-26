"use client";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { LinkedText } from "@/components/linked-text";
import {
  FilePlus2,
  Download,
  Hash,
  Images,
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
import { textValue, type DomainRecord, type RecordKind } from "@/shared/contracts";
import { api, dateLabel, initials, post, value } from "@/shared/client-api";
import { prepareUpload } from "@/shared/client-files";
import {
  useWorkspaceActions,
  useWorkspaceData,
  useWorkspaceStatus,
} from "@/components/workspace-context";
import { useStableCallback } from "@/shared/use-stable-callback";
import { LiveStatus } from "@/components/live-status";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { useChatRead } from "@/modules/notifications/use-chat-read";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DocumentAttachment } from "@/modules/documents/components/document-attachment";
import { ImageGallery } from "@/components/image-gallery";
import { NewDocumentDialog } from "@/modules/documents/components/new-document-dialog";
import { documentAccept } from "@/modules/documents/components/record-documents";
import { ChatActionMenu } from "./chat-action-menu";
import { isPlainClick, navigateWorkspace } from "@/shared/client-navigation";
import { messageInChat, type ChatMediaItem } from "../media";
import { photoReplyValue, type PhotoReply } from "../photo-reply";
import { PhotoReplyPreview } from "./photo-reply-preview";
import { useConfirm } from "@/components/confirm-dialog";
const ChatMediaDialog = dynamic(() => import("./chat-media"));
const DocumentEditor = dynamic(() => import("@/modules/documents/components/document-editor"), {
  ssr: false,
});

export function ChatChannel({
  productionId = "",
  conversation,
  focusedMessageId = "",
  title,
  onManage,
  sidebarToggle,
  mobileChannelToggle,
  onCreatePrivate,
  onCreateTeam,
}: {
  productionId?: string;
  conversation?: DomainRecord;
  focusedMessageId?: string;
  title: string;
  onManage?: () => void;
  sidebarToggle?: ReactNode;
  mobileChannelToggle?: ReactNode;
  onCreatePrivate?: () => void;
  onCreateTeam?: () => void;
}) {
  const workspace = useWorkspaceData();
  const { reload, save, remove } = useWorkspaceActions();
  const { busy } = useWorkspaceStatus();
  const confirm = useConfirm();
  const conversationId = conversation?.id || "",
    archived = conversation?.data.archived === true;
  const [sending, setSending] = useState(false),
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
  const messageTarget = useRef<HTMLElement>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSource, setMediaSource] = useState<ChatMediaItem | null>(null);
  const [replyFile, setReplyFile] = useState<DomainRecord | null>(null);
  const filesById = useMemo(
    () => new Map(workspace.records.files.map((file) => [file.id, file])),
    [workspace.records.files],
  );
  // Built once per files/members update instead of searching both lists for every message.
  const filesByMessage = useMemo(() => {
    const result = new Map<string, DomainRecord[]>();
    for (const file of workspace.records.files) {
      if (file.data.recordKind !== "messages") continue;
      const id = value(file.data, "recordId");
      const list = result.get(id);
      if (list) list.push(file);
      else result.set(id, [file]);
    }
    return result;
  }, [workspace.records.files]);
  const membersById = useMemo(
    () => new Map(workspace.members.map((member) => [member.id, member])),
    [workspace.members],
  );
  const positionedTarget = useRef("");
  const [linkedMessage, setLinkedMessage] = useState<{ id: string; record?: DomainRecord }>();
  const messageInput = useRef<HTMLTextAreaElement>(null);
  useChatRead(conversationId, productionId, bottom);
  const recentMessages = useMemo(
    () =>
      workspace.records.messages
        .filter((message) => messageInChat(message, { conversationId, productionId }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [workspace.records.messages, conversationId, productionId],
  );
  const targetInHistory = recentMessages.some((message) => message.id === focusedMessageId);
  const fetchedTarget =
    !targetInHistory && linkedMessage?.id === focusedMessageId ? linkedMessage.record : undefined;
  useEffect(() => {
    if (!focusedMessageId || targetInHistory) return;
    const controller = new AbortController();
    void api<DomainRecord>(`/api/records/messages/${encodeURIComponent(focusedMessageId)}`, {
      signal: controller.signal,
    })
      .then((record) => {
        if (controller.signal.aborted) return;
        const matchesChannel = messageInChat(record, { conversationId, productionId });
        setLinkedMessage({
          id: focusedMessageId,
          record: record.id === focusedMessageId && matchesChannel ? record : undefined,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLinkedMessage({ id: focusedMessageId });
      });
    return () => controller.abort();
  }, [focusedMessageId, targetInHistory, conversationId, productionId]);
  const messages = useMemo(
    () =>
      fetchedTarget
        ? [...recentMessages, fetchedTarget].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : recentMessages,
    [fetchedTarget, recentMessages],
  );
  useLayoutEffect(() => {
    const latest = messages.at(-1);
    const list = messageList.current;
    const target = messageTarget.current;
    if (!focusedMessageId) positionedTarget.current = "";
    if (list && target && positionedTarget.current !== focusedMessageId) {
      target.focus({ preventScroll: true });
      const offset = target.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTop += offset - Math.max(0, (list.clientHeight - target.offsetHeight) / 2);
      nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
      positionedTarget.current = focusedMessageId;
      lastMessage.current = latest?.id || "";
      return;
    }
    if (!latest || latest.id === lastMessage.current) return;
    if (!lastMessage.current || latest.data.userId === workspace.user.id || nearBottom.current) {
      if (list) list.scrollTop = list.scrollHeight;
    }
    lastMessage.current = latest.id;
  }, [messages, workspace.user.id, focusedMessageId]);
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
  const replyToPhoto = useStableCallback((file: DomainRecord) => {
    setMediaOpen(false);
    setReplyFile(file);
    requestAnimationFrame(() => messageInput.current?.focus());
  });
  const openSource = useStableCallback((messageId: string) => {
    positionedTarget.current = "";
    if (focusedMessageId === messageId && messageTarget.current) {
      messageTarget.current.focus({ preventScroll: true });
      messageTarget.current.scrollIntoView({ block: "center" });
      return;
    }
    const next = new URL(location.href);
    next.searchParams.set("messageId", messageId);
    navigateWorkspace(next.pathname + next.search);
  });
  const update = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Aktion fehlgeschlagen");
    }
  };
  const editMessage = useStableCallback((message: DomainRecord) => {
    setEditing(message);
    setEditingText(value(message.data, "text"));
  });
  const deleteMessage = useStableCallback(async (message: DomainRecord) => {
    if (
      await confirm({
        message: `Eigene Nachricht vom ${dateLabel(message.createdAt, true)} löschen?`,
        confirmLabel: "Löschen",
        destructive: true,
      })
    )
      void update(() => remove(message));
  });
  const onReply = archived || sending ? undefined : replyToPhoto;
  return (
    <section className="chat-main">
      <header className="chat-heading chat-mobile-heading">
        {mobileChannelToggle || <h2>{title}</h2>}
        <LiveStatus compact />
        <ChatActionMenu label="Chataktionen" icon={<MoreHorizontal size={21} aria-hidden="true" />}>
          {archived && <Badge>Archiviert</Badge>}
          <LiveStatus recovery />
          <button type="button" onClick={() => setMediaOpen(true)}>
            <Images size={17} />
            Medien &amp; Dateien
          </button>
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
              if (!isPlainClick(event)) return;
              event.preventDefault();
              navigateWorkspace("/?module=help&guide=app-install");
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
          <Button onClick={() => setMediaOpen(true)}>
            <Images size={16} />
            Medien &amp; Dateien
          </Button>
          {onManage && <Button onClick={onManage}>Verwalten</Button>}
          <ExportButton onClick={() => setExporting(true)} />
        </div>
      </header>
      {!!focusedMessageId && !targetInHistory && !fetchedTarget && (
        <p className="chat-archived-note" role="status">
          {linkedMessage?.id === focusedMessageId
            ? "Die verlinkte Nachricht ist nicht verfügbar."
            : "Nachricht wird geöffnet …"}
        </p>
      )}
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
              const own = message.data.userId === workspace.user.id;
              let attached = filesByMessage.get(message.id) ?? noFiles;
              if (
                fetchedTarget?.id === message.id &&
                mediaSource?.messageId === message.id &&
                !attached.some((file) => file.id === mediaSource.file.id)
              )
                attached = [...attached, mediaSource.file];
              const focused = message.id === focusedMessageId;
              const photoReply = photoReplyValue(message.data.photoReply);
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  authorName={membersById.get(textValue(message.data.userId))?.name}
                  own={own}
                  attached={attached}
                  focused={focused}
                  targetRef={focused ? messageTarget : undefined}
                  photoReply={photoReply}
                  photoReplyName={
                    photoReply
                      ? value(filesById.get(photoReply.fileId)?.data || {}, "name")
                      : undefined
                  }
                  editable={own && !archived}
                  actionsDisabled={own && (sending || busy)}
                  onReply={onReply}
                  onSource={openSource}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                />
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
        <Composer
          title={title}
          conversationId={conversationId}
          productionId={productionId}
          privateChat={!!conversation && conversation.data.mode !== "team"}
          replyFile={replyFile}
          onClearReply={() => setReplyFile(null)}
          sending={sending}
          onSendingChange={setSending}
          error={error}
          onError={setError}
          inputRef={messageInput}
          onCreateDocument={() => setCreatingDocument(true)}
          reload={reload}
        />
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
            await reload(["messages", "files"]);
            setCreatingDocument(false);
            setOpenedDocument(file);
          }}
        />
      )}
      {mediaOpen && (
        <ChatMediaDialog
          title={title}
          productionId={productionId}
          conversationId={conversationId}
          onClose={() => setMediaOpen(false)}
          onReply={archived || sending ? undefined : replyToPhoto}
          onMessage={(item) => {
            setMediaSource(item);
            setMediaOpen(false);
            openSource(item.messageId);
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

const noFiles: DomainRecord[] = [];

/** One chat message; memoized so typing or new messages do not re-render the whole history. */
const MessageRow = memo(function MessageRow({
  message,
  authorName,
  own,
  attached,
  focused,
  targetRef,
  photoReply,
  photoReplyName,
  editable,
  actionsDisabled,
  onReply,
  onSource,
  onEdit,
  onDelete,
}: {
  message: DomainRecord;
  authorName?: string;
  own: boolean;
  attached: readonly DomainRecord[];
  focused: boolean;
  targetRef?: RefObject<HTMLElement | null>;
  photoReply?: PhotoReply;
  photoReplyName?: string;
  editable: boolean;
  actionsDisabled: boolean;
  onReply?: (file: DomainRecord) => void;
  onSource: (messageId: string) => void;
  onEdit: (message: DomainRecord) => void;
  onDelete: (message: DomainRecord) => void;
}) {
  const attachmentIds = Array.isArray(message.data.attachmentIds)
    ? (message.data.attachmentIds as string[])
    : [];
  const sent = dateLabel(message.createdAt, true);
  return (
    <article
      className={`chat-message${own ? " own" : ""}${focused ? " notification-target" : ""}`}
      ref={targetRef}
      tabIndex={focused ? -1 : undefined}
    >
      <span className="avatar">{initials(authorName || "Team")}</span>
      <div className="message-content">
        <header>
          <strong>{authorName || "Teammitglied"}</strong>
          <time className="small muted" dateTime={message.createdAt}>
            {sent}
          </time>
          {message.version > 1 && <span className="small muted">bearbeitet</span>}
        </header>
        {photoReply && (
          <PhotoReplyPreview
            key={photoReply.fileId}
            reply={photoReply}
            name={photoReplyName}
            onSource={() => onSource(photoReply.messageId)}
          />
        )}
        <p>
          <LinkedText>{value(message.data, "text")}</LinkedText>
        </p>
        {attached.length > 0 && (
          <ImageGallery files={attached} onReply={onReply}>
            {(openImage) =>
              attached.map((file) => (
                <DocumentAttachment key={file.id} file={file} compact onOpenImage={openImage} />
              ))
            }
          </ImageGallery>
        )}
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
        {editable && (
          <div className="message-actions">
            <button
              className="icon-button"
              aria-label={`Nachricht von ${sent} bearbeiten`}
              disabled={actionsDisabled}
              onClick={() => onEdit(message)}
            >
              <Pencil size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={`Nachricht von ${sent} löschen`}
              disabled={actionsDisabled}
              onClick={() => onDelete(message)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
});

/**
 * Message input with its own state: typing re-renders only the composer, never the history.
 * Sending reloads only messages (and files when something was attached).
 */
function Composer({
  title,
  conversationId,
  productionId,
  privateChat,
  replyFile,
  onClearReply,
  sending,
  onSendingChange,
  error,
  onError,
  inputRef,
  onCreateDocument,
  reload,
}: {
  title: string;
  conversationId: string;
  productionId: string;
  privateChat: boolean;
  replyFile: DomainRecord | null;
  onClearReply: () => void;
  sending: boolean;
  onSendingChange: (sending: boolean) => void;
  error: string;
  onError: (message: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onCreateDocument: () => void;
  reload: (kinds?: readonly RecordKind[]) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const heightCap = useRef(120);
  // Measure the panel only when the viewport changes; typing just fits the textarea.
  useLayoutEffect(() => {
    const measure = () => {
      const input = inputRef.current;
      if (!input) return;
      if (!window.matchMedia("(max-width: 1100px)").matches) {
        heightCap.current = 0;
        input.style.removeProperty("height");
        return;
      }
      const panelHeight =
        input.closest(".chat-layout")?.getBoundingClientRect().height || window.innerHeight;
      heightCap.current = Math.max(44, Math.min(120, panelHeight * 0.28));
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [inputRef]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || !heightCap.current) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(heightCap.current, input.scrollHeight)}px`;
  }, [text, inputRef]);
  const sendKey = useRef<{ key: string; text: string } | null>(null);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if ((!text.trim() && !files.length) || sending) return;
    onSendingChange(true);
    onError("");
    // A retry of the same draft after a network error returns the stored message.
    if (!sendKey.current || sendKey.current.text !== text)
      sendKey.current = { key: crypto.randomUUID(), text };
    try {
      const result = await post<DomainRecord | { record: DomainRecord }>("/api/records/messages", {
        idempotencyKey: sendKey.current.key,
        data: {
          text: text.trim() || "Dateianhang",
          ...(conversationId ? { conversationId } : { productionId }),
          attachmentIds: [],
          ...(replyFile
            ? { photoReply: { messageId: replyFile.data.recordId, fileId: replyFile.id } }
            : {}),
        },
      });
      const record = "record" in result ? result.record : result;
      for (const file of files) {
        const form = new FormData();
        form.append("file", await prepareUpload(file, "messages"));
        form.append("recordKind", "messages");
        form.append("recordId", record.id);
        await api("/api/files", { method: "POST", body: form });
      }
      const attached = files.length > 0;
      sendKey.current = null;
      setText("");
      setFiles([]);
      onClearReply();
      await reload(attached ? ["messages", "files"] : ["messages"]);
    } catch (exception) {
      onError(
        exception instanceof Error ? exception.message : "Nachricht konnte nicht gesendet werden",
      );
    } finally {
      onSendingChange(false);
    }
  };
  return (
    <form className="chat-composer" onSubmit={send}>
      <div className="chat-composer-notices">
        {replyFile && (
          <PhotoReplyPreview
            key={replyFile.id}
            reply={{ messageId: value(replyFile.data, "recordId"), fileId: replyFile.id }}
            name={value(replyFile.data, "name")}
            onCancel={sending ? undefined : onClearReply}
          />
        )}
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
          <button type="button" onClick={onCreateDocument} disabled={sending}>
            <FilePlus2 size={18} />
            Gemeinsames Dokument anlegen
          </button>
        </ChatActionMenu>
        <textarea
          id="message"
          ref={inputRef}
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
        <Button title="Gemeinsames Dokument anlegen" disabled={sending} onClick={onCreateDocument}>
          <FilePlus2 size={16} />{" "}
          <span>
            <span className="chat-document-prefix">Gemeinsames </span>Dokument
          </span>
        </Button>
        <span className="small muted">
          {privateChat ? "Nur die Teilnehmenden haben Zugriff." : "Nur das Team hat Zugriff."}
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
  );
}
