"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { whatsNewHighlights, whatsNewTour, type WhatsNewStep } from "./whats-new-content";
import styles from "./whats-new.module.css";

/**
 * Shown once to existing team members after a release that changes the interface.
 * First a short overview, then an optional guided walk to the places that moved.
 */
export function WhatsNew({
  navigate,
  onDone,
}: {
  navigate: (module: string) => void;
  onDone: () => void;
}) {
  const { workspace, action, busy } = useWorkspace();
  const [phase, setPhase] = useState<"overview" | "tour">("overview");
  const [error, setError] = useState("");
  const admin = workspace.user.role !== "user";
  const highlights = whatsNewHighlights.filter((item) => admin || !item.adminOnly);
  const steps = whatsNewTour.filter((item) => admin || !item.adminOnly);
  const finish = useCallback(async () => {
    setError("");
    try {
      await action("profile-update", undefined, { onboardingCompleted: true });
      onDone();
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Das konnte nicht gespeichert werden.",
      );
    }
  }, [action, onDone]);
  if (phase === "tour")
    return (
      <CoachMarks
        steps={steps}
        navigate={navigate}
        onFinish={() => void finish()}
        error={error}
      />
    );
  return (
    <Modal title="Neu in DigitalMask" onClose={() => !busy && void finish()} className={styles.sheet}>
      <div className={styles.intro}>
        <span className={styles.introMark} aria-hidden="true">
          <Sparkles size={22} />
        </span>
        <p>
          DigitalMask hat einen frischen Look und ein paar Dinge liegen jetzt an einem besseren
          Platz. Hier ist das Wichtigste in einer Minute.
        </p>
      </div>
      <ul className={styles.highlights}>
        {highlights.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={20} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
      {error && <ErrorMessage message={error} />}
      <footer className={styles.footer}>
        <Button variant="secondary" disabled={busy} onClick={() => void finish()}>
          Alles klar
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => setPhase("tour")}>
          Kurz zeigen
          <ArrowRight size={17} />
        </Button>
      </footer>
    </Modal>
  );
}

function waitForElement(selector: string, timeout = 2500) {
  return new Promise<HTMLElement | null>((resolve) => {
    const started = performance.now();
    const look = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && element.getBoundingClientRect().height > 0) return resolve(element);
      if (performance.now() - started > timeout) return resolve(null);
      requestAnimationFrame(look);
    };
    look();
  });
}

function CoachMarks({
  steps,
  navigate,
  onFinish,
  error,
}: {
  steps: readonly WhatsNewStep[];
  navigate: (module: string) => void;
  onFinish: () => void;
  error: string;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;
  const mobile = typeof window !== "undefined" && matchMedia("(max-width: 760px)").matches;
  const selector = (mobile && step.mobileTarget) || step.target;

  useEffect(() => {
    let cancelled = false;
    navigate(step.module);
    void waitForElement(selector).then((element) => {
      if (cancelled) return;
      target.current = element;
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "instant" });
        setRect(element.getBoundingClientRect());
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, selector, step.module]);

  useEffect(() => {
    const update = () => {
      if (target.current?.isConnected) setRect(target.current.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (ready) card.current?.focus({ preventScroll: true });
  }, [ready, index]);

  const goTo = (target: number) => {
    setReady(false);
    setRect(null);
    setIndex(target);
  };
  const next = () => (last ? onFinish() : goTo(index + 1));
  const padding = 8;
  const spot = rect
    ? {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null;
  const below = !spot || spot.top + spot.height + 220 < window.innerHeight;
  const cardStyle: React.CSSProperties = spot
    ? below
      ? { top: Math.min(spot.top + spot.height + 14, window.innerHeight - 240) }
      : { bottom: Math.max(window.innerHeight - spot.top + 14, 90) }
    : { top: "50%", translate: "-50% -50%" };

  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-step-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onFinish();
        if (event.key === "ArrowRight") next();
        if (event.key === "ArrowLeft" && index > 0) goTo(index - 1);
      }}
    >
      {spot ? (
        <div className={styles.spotlight} style={spot} aria-hidden="true" />
      ) : (
        <div className={styles.dim} aria-hidden="true" />
      )}
      <div
        ref={card}
        tabIndex={-1}
        className={`${styles.card} ${ready ? styles.cardVisible : ""}`}
        style={cardStyle}
      >
        <div className={styles.cardHead}>
          <span className={styles.counter}>
            {index + 1} von {steps.length}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onFinish}
            aria-label="Rundgang beenden"
          >
            <X size={18} />
          </button>
        </div>
        <h2 id="whats-new-step-title">{step.title}</h2>
        <p>{step.text}</p>
        {error && <ErrorMessage message={error} />}
        <div className={styles.cardActions}>
          {index > 0 && (
            <Button variant="ghost" onClick={() => goTo(index - 1)}>
              Zurück
            </Button>
          )}
          <Button variant="primary" onClick={next}>
            {last ? "Fertig" : "Weiter"}
          </Button>
        </div>
        <div className={styles.dots} aria-hidden="true">
          {steps.map((item, dot) => (
            <span key={item.title} className={dot === index ? styles.dotActive : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
