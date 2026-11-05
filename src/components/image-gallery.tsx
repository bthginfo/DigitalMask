"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { Modal } from "./ui";
import styles from "./image-gallery.module.css";

export function isImageAttachment(file: DomainRecord) {
  return value(file.data, "mime").startsWith("image/");
}

/** Only the active image is mounted here, using the existing private file URL. */
export function ImageGallery({
  files,
  children,
}: {
  files: readonly DomainRecord[];
  children: (openImage: (id: string) => void) => ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const images = files.filter(isImageAttachment);
  const index = images.findIndex((file) => file.id === activeId);
  const active = images[index];
  const multiple = images.length > 1;
  const move = (step: number) => {
    if (!multiple) return;
    setActiveId((current) => {
      const position = images.findIndex((file) => file.id === current);
      return position < 0 ? current : images[(position + step + images.length) % images.length].id;
    });
  };
  const name = active ? value(active.data, "name") || "Bild" : "";

  return (
    <>
      {children(setActiveId)}
      {active && (
        <Modal
          title="Bildergalerie"
          className={styles.dialog}
          onClose={() => setActiveId(null)}
          onKeyDown={(event) => {
            if (!multiple || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            event.stopPropagation();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }}
        >
          <GalleryImage
            key={active.id}
            file={active}
            name={name}
            onMove={multiple ? move : undefined}
          />
          <div className={styles.footer}>
            <div className={styles.caption} aria-live="polite" aria-atomic="true">
              <strong title={name}>{name}</strong>
              {multiple && (
                <span>
                  Bild {index + 1} von {images.length}
                </span>
              )}
            </div>
            <div className={styles.actions}>
              {multiple && (
                <>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Vorheriges Bild"
                    title="Vorheriges Bild"
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Nächstes Bild"
                    title="Nächstes Bild"
                    onClick={() => move(1)}
                  >
                    <ChevronRight size={22} aria-hidden="true" />
                  </button>
                </>
              )}
              <a
                className="icon-button"
                href={`/api/files/${active.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Bild in neuem Tab öffnen"
                title="Bild in neuem Tab öffnen"
              >
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function GalleryImage({
  file,
  name,
  onMove,
}: {
  file: DomainRecord;
  name: string;
  onMove?: (step: number) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={styles.stage}
      role="group"
      aria-label="Bildvorschau"
      onTouchStart={(event) => {
        const first = event.touches[0];
        touchStart.current =
          onMove && event.touches.length === 1 ? { x: first.clientX, y: first.clientY } : null;
      }}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        const end = event.changedTouches[0];
        if (!onMove || !start || !end || event.touches.length) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) onMove(dx < 0 ? 1 : -1);
      }}
    >
      {status !== "error" && (
        <Image
          unoptimized
          fill
          loading="eager"
          draggable={false}
          src={`/api/files/${file.id}`}
          alt={name}
          className={styles.photo}
          data-ready={status === "ready"}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      )}
      {status === "loading" && (
        <p className={styles.message} role="status">
          Bild wird geladen …
        </p>
      )}
      {status === "error" && (
        <p className={styles.message} role="status">
          Dieses Bild konnte nicht geladen werden.
        </p>
      )}
    </div>
  );
}
