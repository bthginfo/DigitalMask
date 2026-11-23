"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ImageGallery, isImageAttachment } from "@/components/image-gallery";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import type { DomainRecord } from "@/shared/contracts";
import { DocumentAttachment } from "@/modules/documents/components/document-attachment";
import { api, instantDate, localDate, value } from "@/shared/client-api";
import {
  chatMediaItems,
  mediaBatchSize,
  workspaceMessageLimit,
  type ChatMediaItem,
  type ChatScope,
} from "../media";
import styles from "./chat-media.module.css";

type Page = { items: ChatMediaItem[]; more: boolean };
const dayFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "full",
  timeZone: "Europe/Berlin",
});

export default function ChatMediaDialog({
  conversationId,
  productionId,
  title,
  onClose,
  onMessage,
  onReply,
}: ChatScope & {
  title: string;
  onClose: () => void;
  onMessage: (item: ChatMediaItem) => void;
  onReply?: (file: DomainRecord) => void;
}) {
  const { workspace } = useWorkspace();
  const { messages, files } = workspace.records;
  const archive = messages.length >= workspaceMessageLimit;
  const [limit, setLimit] = useState(mediaBatchSize);
  const [cursor, setCursor] = useState({ before: "", beforeId: "" });
  const [remote, setRemote] = useState<Page & { request: typeof cursor | null; error: string }>({
    items: [],
    more: false,
    request: null,
    error: "",
  });
  const loading = archive && remote.request !== cursor;
  const error = archive && !loading ? remote.error : "";
  const recent = useMemo(
    () => (archive ? [] : chatMediaItems(messages, files, { conversationId, productionId })),
    [archive, messages, files, conversationId, productionId],
  );
  useEffect(() => {
    if (!archive) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ conversationId, productionId, ...cursor });
    void api<Page>(`/api/messages/media?${query}`, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setRemote((previous) => {
          if (!cursor.before) return { ...page, request: cursor, error: "" };
          const known = new Set(previous.items.map((item) => item.file.id));
          return {
            items: [...previous.items, ...page.items.filter((item) => !known.has(item.file.id))],
            more: page.more,
            request: cursor,
            error: "",
          };
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setRemote((previous) => ({
            ...previous,
            request: cursor,
            error: e instanceof Error ? e.message : "Die Anhänge konnten nicht geladen werden.",
          }));
      });
    return () => controller.abort();
  }, [archive, conversationId, productionId, cursor]);
  const items = archive ? remote.items : recent.slice(0, limit);
  const more = archive ? remote.more : recent.length > limit;
  const days = new Map<string, ChatMediaItem[]>();
  for (const item of items) {
    const day = localDate(instantDate(item.sentAt));
    const entries = days.get(day) || [];
    entries.push(item);
    days.set(day, entries);
  }
  return (
    <Modal title="Medien & Dateien" onClose={onClose} wide>
      <p className="muted">{title}</p>
      <ImageGallery files={items.map((item) => item.file)} onReply={onReply}>
        {(openImage) =>
          [...days].map(([day, entries]) => (
            <section key={day} className={styles.day}>
              <h3>{dayFormat.format(instantDate(day))}</h3>
              <ul>
                {entries.map((item) => {
                  const { file } = item;
                  const name = value(file.data, "name") || "Anhang";
                  return (
                    <li key={file.id}>
                      {isImageAttachment(file) ? (
                        <button
                          type="button"
                          className={styles.photo}
                          aria-label={`${name} vergrößern`}
                          onClick={() => openImage(file.id)}
                        >
                          <Image
                            src={`/api/files/${encodeURIComponent(file.id)}?preview=thumbnail`}
                            width={160}
                            height={100}
                            alt=""
                            loading="lazy"
                            unoptimized
                          />
                          <span>{name}</span>
                        </button>
                      ) : (
                        <DocumentAttachment file={file} compact />
                      )}
                      <button
                        type="button"
                        className={styles.source}
                        aria-label={`Zur Nachricht mit ${name}`}
                        onClick={() => onMessage(item)}
                      >
                        Zur Nachricht
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        }
      </ImageGallery>
      {!items.length && !loading && !error && (
        <p>In diesem Chat wurden noch keine Fotos oder Dateien geteilt.</p>
      )}
      {loading && <p role="status">Anhänge werden geladen …</p>}
      <ErrorMessage message={error} />
      {error && <Button onClick={() => setCursor({ ...cursor })}>Erneut versuchen</Button>}
      {more && !loading && !error && (
        <Button
          onClick={() => {
            const last = items.at(-1);
            if (archive && last) setCursor({ before: last.sentAt, beforeId: last.file.id });
            else setLimit(limit + mediaBatchSize);
          }}
        >
          Ältere Anhänge anzeigen
        </Button>
      )}
    </Modal>
  );
}
