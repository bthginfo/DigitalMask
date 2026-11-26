"use client";
import { useId, useState } from "react";
import {
  normalizeDurationInput,
  parseDurationInput,
  type DurationInputOptions,
} from "@/shared/duration-input";
import styles from "./duration-field.module.css";

/** A text field for h:mm durations; the typed text is normalized when the field is left. */
export function DurationField({
  label,
  value,
  onChange,
  hint = "z. B. 1:30, 1,5 oder 90m",
  name,
  placeholder = "h:mm",
  options = {},
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  name?: string;
  placeholder?: string;
  options?: DurationInputOptions;
}) {
  const id = useId();
  const [error, setError] = useState("");
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        required={options.required}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
          if (error) setError("");
        }}
        onBlur={() => {
          const next = normalizeDurationInput(value, options);
          if (next !== value) onChange(next);
          try {
            parseDurationInput(next, { ...options, label });
            setError("");
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Bitte prüfe die Dauer.");
          }
        }}
      />
      <small
        id={`${id}-hint`}
        className={error ? styles.error : styles.hint}
        role={error ? "alert" : undefined}
      >
        {error || hint}
      </small>
    </div>
  );
}
