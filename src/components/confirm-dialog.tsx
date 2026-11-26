"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  /** Short question or statement; also the dialog title when no `title` is given. */
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Deleting, discarding or revoking: the confirm button uses the danger style. */
  destructive?: boolean;
}
export type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Outside the provider (for example on the login page) the browser dialog still works. */
const browserConfirm: Confirm = async (options) =>
  window.confirm(typeof options === "string" ? options : options.message);

/** Promise-based in-app confirmation: `if (await confirm({ message, destructive: true }))`. */
export function useConfirm(): Confirm {
  return useContext(ConfirmContext) ?? browserConfirm;
}

/** Shorthand for the guard used by editors with unsaved input. */
export const discardChanges: ConfirmOptions = {
  title: "Ungespeicherte Änderungen",
  message: "Ungespeicherte Änderungen verwerfen?",
  confirmLabel: "Verwerfen",
  cancelLabel: "Weiter bearbeiten",
  destructive: true,
};

interface Request {
  id: number;
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const next = useRef(0);
  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        const request = {
          id: ++next.current,
          options: typeof options === "string" ? { message: options } : options,
          resolve,
        };
        setQueue((current) => [...current, request]);
      }),
    [],
  );
  const current = queue[0];
  const settle = useCallback((request: Request, confirmed: boolean) => {
    request.resolve(confirmed);
    setQueue((pending) => pending.filter((item) => item.id !== request.id));
  }, []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && (
        <ConfirmDialog
          key={current.id}
          {...current.options}
          onSettle={(confirmed) => settle(current, confirmed)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  message,
  title,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  destructive = false,
  onSettle,
}: ConfirmOptions & { onSettle: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    // The top layer stacks this above any open editor dialog.
    dialog?.showModal();
    // Destructive choices start on the safe option.
    cancelButton.current?.focus();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={title ? messageId : undefined}
      className="dialog confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSettle(false);
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onSettle(false);
      }}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title || message}</h2>
      </header>
      {title && (
        <p id={messageId} className="confirm-dialog-message">
          {message}
        </p>
      )}
      <footer className="dialog-footer">
        <button
          ref={cancelButton}
          type="button"
          className="button secondary"
          onClick={() => onSettle(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`button ${destructive ? "danger-ghost" : "primary"}`}
          onClick={() => onSettle(true)}
        >
          {confirmLabel}
        </button>
      </footer>
    </dialog>
  );
}
