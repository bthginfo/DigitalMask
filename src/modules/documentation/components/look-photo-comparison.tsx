"use client";

import Image from "next/image";
import { useRef, useState, type CSSProperties } from "react";
import { ChevronsLeftRight, ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "@/components/ui";
import { useGalleryZoom } from "@/components/image-gallery-zoom";
import { value } from "@/shared/client-api";
import type { DomainRecord } from "@/shared/contracts";
import styles from "./look-photo-comparison.module.css";

const photoName = (file: DomainRecord) => value(file.data, "name") || "Foto";

export default function LookPhotoComparison({
  photos,
  onClose,
}: {
  photos: DomainRecord[];
  onClose: () => void;
}) {
  const [pair, setPair] = useState([photos[0].id, photos[1].id]);
  const left =
    photos.find((file) => file.id === pair[0]) ?? photos.find((file) => file.id !== pair[1])!;
  const right =
    photos.find((file) => file.id === pair[1] && file.id !== left.id) ??
    photos.find((file) => file.id !== left.id)!;
  return (
    <Modal title="Fotos vergleichen" className={styles.dialog} onClose={onClose} wide>
      <div className={styles.pickers}>
        {[left, right].map((selected, index) => (
          <label key={index}>
            {index === 0 ? "Linkes Foto" : "Rechtes Foto"}
            <select
              value={selected.id}
              onChange={(event) => {
                const id = event.target.value;
                if (index === 0) setPair([id, id === right.id ? left.id : right.id]);
                else setPair([id === left.id ? right.id : left.id, id]);
              }}
            >
              {photos.map((file, i) => (
                <option key={file.id} value={file.id}>
                  {i + 1} · {photoName(file)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <ComparisonStage key={JSON.stringify([left.id, right.id])} left={left} right={right} />
    </Modal>
  );
}

function ComparisonStage({ left, right }: { left: DomainRecord; right: DomainRecord }) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const ready = loaded.length === 2;
  const { stage, image, pointerHandlers, view, zoomIn, zoomOut, reset, atMax, pan } =
    useGalleryZoom(ready);
  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  const updateSplit = (percent: number) =>
    setSplit(Math.min(100, Math.max(0, Math.round(percent))));
  return (
    <>
      <div className={styles.frame} ref={frame} style={{ "--split": `${split}%` } as CSSProperties}>
        <div
          ref={stage}
          className={styles.images}
          {...pointerHandlers}
          role="group"
          aria-label="Fotovergleich, vergrößerten Ausschnitt mit Pfeiltasten verschieben"
          tabIndex={view.scale > 1 ? 0 : undefined}
          onKeyDown={(e) => {
            if (view.scale === 1) return;
            const offset: Record<string, [number, number]> = {
              ArrowLeft: [40, 0],
              ArrowRight: [-40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };
            if (offset[e.key]) {
              e.preventDefault();
              pan(...offset[e.key]);
            }
          }}
        >
          {[right, left].map((file) => (
            <div
              key={file.id}
              className={styles.layer}
              style={
                file.id === left.id
                  ? { clipPath: "inset(0 calc(100% - var(--split)) 0 0)" }
                  : undefined
              }
            >
              <Image
                ref={file.id === left.id ? image : undefined}
                unoptimized
                fill
                draggable={false}
                loading="eager"
                src={`/api/files/${encodeURIComponent(file.id)}`}
                alt={photoName(file)}
                style={{ transform }}
                onLoad={() => setLoaded((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]))}
                onError={() =>
                  setFailed((ids) => (ids.includes(file.id) ? ids : [...ids, file.id]))
                }
              />
            </div>
          ))}
        </div>
        {failed.length ? (
          <p className={styles.status} role="status">
            {failed.map((id) => photoName(id === left.id ? left : right)).join(" und ")} konnte
            nicht geladen werden.
          </p>
        ) : (
          !ready && (
            <p className={styles.status} role="status">
              Fotos werden geladen …
            </p>
          )
        )}
        <div className={styles.line} aria-hidden="true" />
        <div
          className={styles.handle}
          role="slider"
          tabIndex={0}
          aria-label="Bildaufteilung"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={split}
          aria-valuetext={`${split} Prozent linkes Foto`}
          onPointerDown={(e) => {
            if (e.button === 0) e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const rect = frame.current?.getBoundingClientRect();
            if (rect?.width && e.currentTarget.hasPointerCapture(e.pointerId))
              updateSplit(((e.clientX - rect.left) * 100) / rect.width);
          }}
          onKeyDown={(e) => {
            const values: Record<string, number> = {
              ArrowLeft: split - 5,
              ArrowRight: split + 5,
              ArrowDown: split - 5,
              ArrowUp: split + 5,
              Home: 0,
              End: 100,
              PageUp: split + 10,
              PageDown: split - 10,
            };
            if (e.key in values) {
              e.preventDefault();
              updateSplit(values[e.key]);
            }
          }}
        >
          <ChevronsLeftRight size={23} aria-hidden="true" />
        </div>
      </div>
      <div className={styles.controls} role="group" aria-label="Gemeinsamer Bildzoom">
        <button
          type="button"
          className="icon-button"
          aria-label="Beide Fotos verkleinern"
          disabled={!ready || view.scale === 1}
          onClick={zoomOut}
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          className="text-button"
          aria-label="Beide Fotos einpassen"
          disabled={!ready || view.scale === 1}
          onClick={reset}
        >
          {Math.round(view.scale * 100)} %
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Beide Fotos vergrößern"
          disabled={!ready || atMax}
          onClick={zoomIn}
        >
          <ZoomIn size={18} />
        </button>
      </div>
    </>
  );
}
