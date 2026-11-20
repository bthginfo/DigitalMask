"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { Modal } from "./ui";
import { useGalleryZoom } from "./image-gallery-zoom";
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
  const ready = status === "ready";
  const { stage, image, view, atMax, zoomIn, zoomOut, reset, pan, pointerHandlers } =
    useGalleryZoom(ready, onMove);
  const { scale, x, y } = view;
  const zoomed = scale > 1;
  const percent = Math.round(scale * 100);
  const url = `/api/files/${file.id}`;

  return (
    <>
      <div
        ref={stage}
        className={styles.stage}
        role="group"
        aria-label={zoomed ? "Bildvorschau, mit den Pfeiltasten verschieben" : "Bildvorschau"}
        tabIndex={zoomed ? 0 : undefined}
        data-ready={ready}
        data-zoomed={zoomed}
        {...pointerHandlers}
        onKeyDown={(event) => {
          if (!zoomed || event.ctrlKey || event.metaKey || event.altKey) return;
          const offset = arrowPan[event.key];
          if (!offset) return;
          event.preventDefault();
          event.stopPropagation();
          pan(offset[0], offset[1]);
        }}
      >
        {status !== "error" && (
          <Image
            ref={image}
            unoptimized
            fill
            loading="eager"
            draggable={false}
            src={url}
            alt={name}
            className={styles.photo}
            style={zoomed ? { transform: `translate(${x}px, ${y}px) scale(${scale})` } : undefined}
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
      <div className={styles.zoomControls} role="group" aria-label="Bildzoom">
        <button
          type="button"
          className="icon-button"
          aria-label="Bild verkleinern"
          title="Bild verkleinern"
          disabled={!ready || !zoomed}
          onClick={zoomOut}
        >
          <ZoomOut size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`icon-button ${styles.zoomValue}`}
          aria-label={`Bild einpassen, Zoom ${percent} Prozent`}
          title="Ganzes Bild anzeigen"
          disabled={!ready || !zoomed}
          onClick={reset}
        >
          {percent} %
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Bild vergrößern"
          title="Bild vergrößern"
          disabled={!ready || atMax}
          onClick={zoomIn}
        >
          <ZoomIn size={20} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

const arrowPan: Record<string, [number, number] | undefined> = {
  ArrowLeft: [48, 0],
  ArrowRight: [-48, 0],
  ArrowUp: [0, 48],
  ArrowDown: [0, -48],
};
