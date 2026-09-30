"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowUpRight, Download, Plus, X } from "lucide-react";

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
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </header>
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
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
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={onClose}
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
  return message ? (
    <p role="alert" className="error-message">
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
