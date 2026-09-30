"use client";

import { useId, useState, useSyncExternalStore, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

function subscribeHydration() {
  return () => {};
}

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  name: string;
};

export function PasswordInput({ label, id, ...inputProps }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id || `password-${generatedId}`;
  const [visible, setVisible] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const actionLabel = `${label} ${visible ? "verbergen" : "anzeigen"}`;

  return (
    <div className="password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-input">
        <input
          {...inputProps}
          id={inputId}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="icon-button password-toggle"
          aria-label={actionLabel}
          title={actionLabel}
          aria-controls={inputId}
          aria-pressed={visible}
          disabled={!hydrated || inputProps.disabled}
          onPointerDown={(event) => {
            // Keep typed and autofilled input focus when revealing with a pointer.
            if (event.pointerType === "mouse" && event.isPrimary) event.preventDefault();
          }}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
