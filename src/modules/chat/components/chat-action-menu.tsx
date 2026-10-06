"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** A small labelled disclosure; ordinary buttons retain native keyboard behavior. */
export function ChatActionMenu({
  label,
  icon,
  children,
  className = "",
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className={`chat-action-menu ${className}`} ref={container}>
      <button
        ref={trigger}
        type="button"
        className="chat-compact-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {icon}
      </button>
      {open && (
        <div
          id={id}
          className="chat-action-popover"
          role="group"
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a")) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
