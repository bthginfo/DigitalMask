/**
 * Typed durations are shown as h:mm and stored in seconds.
 * Accepted: "1:30", "1.30" (German time notation), "1,5" (decimal hours), "90m", "2h", "1h 30".
 * A bare integer is read in `bareUnit`; for hours, numbers above 24 are read as minutes ("90" → 1:30).
 */
export type DurationInputOptions = {
  label?: string;
  required?: boolean;
  /** Seconds; defaults to one minute. */
  min?: number;
  /** Seconds; defaults to seven days. */
  max?: number;
  bareUnit?: "hours" | "minutes";
};

const HOUR_UNIT = "(?:h|std\\.?|stunden?)";
const MINUTE_UNIT = "(?:m|min\\.?|minuten?)";
const patterns: [RegExp, (match: RegExpMatchArray) => number | undefined][] = [
  [/^(\d{0,3}):(\d{1,2})$/, (m) => minutesOf(Number(m[1] || 0), Number(m[2]))],
  // "1.30" is German time notation; "0.75" (minutes ≥ 60) falls through to decimal hours.
  [
    /^(\d{1,3})\.(\d{2})$/,
    (m) => (Number(m[2]) < 60 ? minutesOf(Number(m[1]), Number(m[2])) : undefined),
  ],
  [
    new RegExp(`^(\\d{1,3}(?:[.,]\\d+)?|[.,]\\d+)\\s*${HOUR_UNIT}?$`),
    (m) => (/[.,]/.test(m[1]) ? Number(m[1].replace(",", ".")) * 60 : undefined),
  ],
  [new RegExp(`^(\\d{1,3})\\s*${HOUR_UNIT}$`), (m) => Number(m[1]) * 60],
  [new RegExp(`^(\\d{1,5})\\s*${MINUTE_UNIT}$`), (m) => Number(m[1])],
  [
    new RegExp(`^(\\d{1,3})\\s*${HOUR_UNIT}\\s*(\\d{1,2})\\s*(?:${MINUTE_UNIT})?$`),
    (m) => minutesOf(Number(m[1]), Number(m[2])),
  ],
];

function minutesOf(hours: number, minutes: number) {
  return minutes < 60 ? hours * 60 + minutes : Number.NaN;
}

/** Minutes for a typed text, or undefined/NaN when it is empty or not a duration. */
function readMinutes(text: string, bareUnit: "hours" | "minutes") {
  const input = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!input) return undefined;
  if (/^\d{1,5}$/.test(input)) {
    const number = Number(input);
    return bareUnit === "minutes" || number > 24 ? number : number * 60;
  }
  for (const [pattern, read] of patterns) {
    const match = input.match(pattern);
    if (!match) continue;
    const minutes = read(match);
    if (minutes !== undefined) return minutes;
  }
  return Number.NaN;
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Seconds for a typed duration; throws a German message for the form. */
export function parseDurationInput(text: string, options: DurationInputOptions = {}) {
  const label = options.label || "Dauer";
  const min = options.min ?? 60;
  const max = options.max ?? 7 * 86400;
  const minutes = readMinutes(text, options.bareUnit || "hours");
  if (minutes === undefined) {
    if (options.required) throw new Error(`Bitte ${label} eintragen.`);
    return 0;
  }
  if (!Number.isFinite(minutes))
    throw new Error(`${label}: bitte als Stunden:Minuten eintragen, zum Beispiel 1:30.`);
  const seconds = Math.round(minutes * 60);
  if (seconds < min) throw new Error(`${label} muss mindestens ${formatDuration(min)} h betragen.`);
  if (seconds > max) throw new Error(`${label} darf höchstens ${formatDuration(max)} h betragen.`);
  return seconds;
}

/** Live preview while typing: undefined for an incomplete or invalid entry. */
export function previewDurationInput(text: string, options: DurationInputOptions = {}) {
  try {
    return parseDurationInput(text, options);
  } catch {
    return undefined;
  }
}

/** The normalized text after leaving the field; invalid text stays so the message can explain it. */
export function normalizeDurationInput(text: string, options: DurationInputOptions = {}) {
  const minutes = readMinutes(text, options.bareUnit || "hours");
  return minutes === undefined || !Number.isFinite(minutes)
    ? text.trim()
    : formatDuration(minutes * 60);
}
