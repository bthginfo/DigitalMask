/** Keep number inputs as text drafts; conversion happens only when applying a form. */
export function numberDraft(value: unknown, fallback?: number) {
  return value === undefined || value === null
    ? fallback === undefined
      ? ""
      : String(fallback)
    : String(value);
}

export type NumberDraftOptions = {
  label: string;
  required?: boolean;
  fallback?: number;
  min?: number;
  max?: number;
  integer?: boolean;
};

export function parseNumberDraft(draft: string, options: NumberDraftOptions): number | undefined {
  if (!draft.trim()) {
    if (options.required) throw new Error(`Bitte ${options.label} eintragen.`);
    return options.fallback;
  }
  const parsed = Number(draft);
  if (!Number.isFinite(parsed))
    throw new Error(`Bitte eine gültige Zahl für ${options.label} eintragen.`);
  if (options.integer && !Number.isInteger(parsed))
    throw new Error(`${options.label} muss eine ganze Zahl sein.`);
  if (options.min !== undefined && parsed < options.min)
    throw new Error(`${options.label} muss mindestens ${options.min} betragen.`);
  if (options.max !== undefined && parsed > options.max)
    throw new Error(`${options.label} darf höchstens ${options.max} betragen.`);
  return parsed;
}

/** Incomplete fields have no numeric preview, including an intentionally empty input. */
export function previewNumberDraft(draft: string, options: Omit<NumberDraftOptions, "label"> = {}) {
  try {
    return parseNumberDraft(draft, { ...options, label: "Zahl" });
  } catch {
    return undefined;
  }
}
