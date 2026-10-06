"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, Download, MoreHorizontal, Plus, X } from "lucide-react";
import { subscribeMobile } from "@/shared/client-storage";
import styles from "./ui.module.css";

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      title={title}
      type={type}
      className={`button ${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Plus size={25} strokeWidth={1.3} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button variant="primary" onClick={onAction}>
          <Plus size={16} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  children,
  secondaryActions,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  secondaryActions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={`page-heading ${compact ? styles.compactHeader : ""}`}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      <div className="heading-actions">
        {secondaryActions && <ActionMenu>{secondaryActions}</ActionMenu>}
        {children}
      </div>
    </header>
  );
}
export function ActionMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (mobile && event.target instanceof Node && !ref.current?.contains(event.target)) {
        if (ref.current) ref.current.open = false;
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [mobile]);
  return (
    <details
      ref={ref}
      className={styles.actionMenu}
      open={!mobile || expanded}
      data-expanded={expanded}
      onToggle={(event) => {
        if (mobile) setExpanded(event.currentTarget.open);
      }}
      onKeyDown={(event) => {
        if (mobile && event.key === "Escape" && ref.current?.open) {
          event.preventDefault();
          ref.current.open = false;
          setExpanded(false);
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="button secondary" aria-label="Weitere Aktionen">
        <MoreHorizontal size={17} />
        Mehr
      </summary>
      <div
        className={styles.actionMenuItems}
        onClickCapture={(event) => {
          if (mobile && event.target instanceof Element && event.target.closest("button")) {
            if (ref.current) ref.current.open = false;
            setExpanded(false);
            ref.current?.querySelector("summary")?.focus();
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Section({
  title,
  meta,
  children,
  action,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
  action?: () => void;
}) {
  return (
    <section className="panel">
      <header className="panel-heading">
        <div>
          <h2>{title}</h2>
          {meta && <span className="muted small">{meta}</span>}
        </div>
        {action && (
          <button className="icon-button" aria-label={`${title} öffnen`} onClick={action}>
            <ArrowUpRight size={18} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    const previousFocus = document.activeElement;
    el?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.setProperty("overflow", "hidden");
    return () => {
      el?.close();
      document.body.style.setProperty("overflow", previous);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      ref.current?.style.setProperty("--dialog-viewport-height", `${viewport.height}px`);
      ref.current?.style.setProperty("--dialog-viewport-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog ${styles.modal} ${wide ? "wide" : ""} ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = ref.current?.getBoundingClientRect();
          if (
            bounds &&
            (event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom)
          )
            onClose();
        }
      }}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Schließen">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message && ref.current?.closest("dialog[open]")) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [message]);
  return message ? (
    <p ref={ref} role="alert" tabIndex={-1} className="error-message">
      {message}
    </p>
  ) : null;
}
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Download size={16} />
      Exportieren
    </Button>
  );
}
