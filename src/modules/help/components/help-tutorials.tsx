"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Play, RotateCcw, Smartphone, VolumeX } from "lucide-react";
import { Button, Empty, Modal } from "@/components/ui";
import type { HelpTutorial } from "../tutorials";
import styles from "./help-tutorials.module.css";

function duration(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} Min.`;
}

function size(bytes: number) {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1_000))} kB`
    : `${(bytes / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

function platform(tutorial: HelpTutorial) {
  return tutorial.platform === "ios"
    ? "iPhone / iPad"
    : tutorial.platform === "android"
      ? "Android"
      : "Alle Geräte";
}

export function HelpTutorialList({
  tutorials,
  onOpen,
  compact = false,
}: {
  tutorials: HelpTutorial[];
  onOpen: (tutorial: HelpTutorial) => void;
  compact?: boolean;
}) {
  if (!tutorials.length) {
    return compact ? null : (
      <Empty
        title="Kein passendes Kurzvideo gefunden."
        description="Versuche einen anderen Begriff. Unter Anleitungen findest du alle Schritte auch zum Lesen."
      />
    );
  }

  return (
    <section
      className={`${styles.library} ${compact ? styles.compact : ""}`}
      aria-label={compact ? "Passende Kurzvideos" : "Kurzvideos"}
    >
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">KURZ GEZEIGT</p>
          <h2>{compact ? "Lieber kurz ansehen?" : "Ein paar Klicks. Ein klarer Ablauf."}</h2>
        </div>
        <span className={styles.silent}>
          <VolumeX size={15} aria-hidden="true" />
          Ohne Ton, mit Text
        </span>
      </div>
      {!compact && (
        <p className={styles.intro}>
          Ausgewählte Anleitungen für häufige Handgriffe. Ein Video lädt erst beim Abspielen.
        </p>
      )}
      <div className={styles.list}>
        {tutorials.map((tutorial) => (
          <button
            key={tutorial.id}
            type="button"
            className={styles.card}
            onClick={() => onOpen(tutorial)}
            aria-label={`Video öffnen: ${tutorial.title}`}
          >
            <span className={styles.preview} aria-hidden="true">
              {/* Native lazy image keeps small static posters out of the image optimization pipeline. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tutorial.poster}
                alt=""
                width={180}
                height={320}
                loading="lazy"
                decoding="async"
              />
              <span className={styles.play}>
                <Play size={18} fill="currentColor" strokeWidth={1.5} />
              </span>
            </span>
            <span className={styles.cardBody}>
              <span className={styles.platform}>
                <Smartphone size={13} aria-hidden="true" />
                {platform(tutorial)}
              </span>
              <span className={styles.cardTitle}>{tutorial.title}</span>
              <span className={styles.description}>{tutorial.description}</span>
              <span className={styles.metadata}>
                {duration(tutorial.durationSeconds)} <span aria-hidden="true">·</span>{" "}
                {size(tutorial.bytes)}
                {tutorial.schematic && <span>· Schematische Handy-Menüs</span>}
              </span>
            </span>
            <span className={styles.openLabel} aria-hidden="true">
              Ansehen
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function HelpTutorialPlayer({
  tutorial,
  onClose,
}: {
  tutorial: HelpTutorial;
  onClose: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [attempt]);
  const handleError = () => {
    setFailed(true);
    setBuffering(false);
  };

  return (
    <Modal title={tutorial.title} onClose={onClose} className={styles.dialog} wide>
      <div className={styles.playerBody}>
        <div className={styles.playerMetadata}>
          <span>{platform(tutorial)}</span>
          <span>{duration(tutorial.durationSeconds)}</span>
          <span>{size(tutorial.bytes)}</span>
          <span className={styles.silent}>
            <VolumeX size={14} aria-hidden="true" /> Ohne Ton, mit Text
          </span>
        </div>
        <p className={styles.playerDescription}>{tutorial.description}</p>
        {tutorial.schematic && (
          <p className={styles.schematic}>
            Schematische Handy-Menüs: Namen und Positionen können je nach Gerät und Version etwas
            abweichen.
          </p>
        )}
        <div className={styles.playerLayout}>
          <div className={styles.mediaColumn}>
            <div className={styles.screen}>
              <video
                key={attempt}
                ref={videoRef}
                aria-label={tutorial.title}
                controls
                playsInline
                preload="none"
                poster={tutorial.poster}
                onError={handleError}
                onWaiting={() => setBuffering(true)}
                onPlaying={() => setBuffering(false)}
                onCanPlay={() => setBuffering(false)}
              >
                <source src={tutorial.video} type="video/mp4" onError={handleError} />
                <track kind="captions" src={tutorial.captions} srcLang="de" label="Deutsch" />
                Dein Browser kann dieses Video nicht abspielen. Du kannst es unten herunterladen.
              </video>
              {buffering && !failed && (
                <span className={styles.loading} role="status">
                  <LoaderCircle size={17} className={styles.spinner} aria-hidden="true" />
                  Video lädt …
                </span>
              )}
            </div>
            {failed && (
              <div className={styles.error} role="alert">
                <p>
                  Das Video konnte nicht abgespielt werden. Versuche es erneut oder lade die Datei
                  herunter.
                </p>
                <Button
                  onClick={() => {
                    setFailed(false);
                    setBuffering(false);
                    setAttempt((value) => value + 1);
                  }}
                >
                  <RotateCcw size={15} /> Erneut laden
                </Button>
              </div>
            )}
            <a href={tutorial.video} download className={styles.download}>
              <Download size={16} aria-hidden="true" />
              MP4 herunterladen <span>({size(tutorial.bytes)})</span>
            </a>
          </div>
          <section className={styles.instructions} aria-label="Schritte zum Nachlesen">
            <h3>Schritte zum Nachlesen</h3>
            <p>Die Anleitung funktioniert auch ohne Video.</p>
            <ol>
              {tutorial.steps.map((step, index) => (
                <li key={`${tutorial.id}-${index}`}>
                  <span aria-hidden="true" className={styles.stepNumber}>
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Modal>
  );
}
