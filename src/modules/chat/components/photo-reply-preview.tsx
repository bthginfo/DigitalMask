"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageOff, Reply, X } from "lucide-react";
import type { PhotoReply } from "../photo-reply";
import styles from "./photo-reply.module.css";

export function PhotoReplyPreview({
  reply,
  name,
  onSource,
  onCancel,
}: {
  reply: PhotoReply;
  name?: string;
  onSource?: () => void;
  onCancel?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const preview = (
    <>
      {failed ? (
        <ImageOff className={styles.missing} size={24} aria-hidden="true" />
      ) : (
        <Image
          unoptimized
          width={44}
          height={44}
          loading="lazy"
          alt=""
          src={`/api/files/${encodeURIComponent(reply.fileId)}?preview=thumbnail`}
          onError={() => setFailed(true)}
        />
      )}
      <span>
        <small>
          <Reply size={13} aria-hidden="true" />
          Antwort auf ein Foto
        </small>
        <strong>{failed ? "Vorschau nicht verfügbar" : name || "Probenfoto"}</strong>
      </span>
    </>
  );
  return (
    <div className={styles.quote}>
      {onSource ? (
        <button
          type="button"
          className={styles.content}
          onClick={onSource}
          aria-label={`Zur ursprünglichen Nachricht mit ${name || "Foto"}`}
        >
          {preview}
        </button>
      ) : (
        <div className={styles.content}>{preview}</div>
      )}
      {onCancel && (
        <button
          className="icon-button"
          type="button"
          aria-label="Fotobezug entfernen"
          onClick={onCancel}
        >
          <X size={17} />
        </button>
      )}
    </div>
  );
}
