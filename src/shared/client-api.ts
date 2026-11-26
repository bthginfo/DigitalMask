import type { RecordData } from "./contracts";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { clientHeaders } from "./client-id";

export class ApiFailure extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...clientHeaders(options.method),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiFailure(
      "Keine Antwort vom Server erhalten. Bitte prüfe deine Verbindung und versuche es erneut.",
      0,
    );
  }
  let data: { error?: string };
  try {
    data = await response.json();
  } catch {
    if (response.ok)
      throw new ApiFailure(
        "Die Serverantwort ist unvollständig angekommen. Bitte versuche es erneut.",
        0,
      );
    data = {};
  }
  if (!response.ok)
    throw new ApiFailure(
      data.error || "Die Anfrage konnte nicht abgeschlossen werden.",
      response.status,
    );
  return data as T;
}
export const post = <T = unknown>(url: string, data: RecordData) =>
  api<T>(url, { method: "POST", body: JSON.stringify(data) });
export const value = (data: RecordData, key: string) =>
  typeof data[key] === "string" ? (data[key] as string) : "";
export const num = (data: RecordData, key: string) =>
  typeof data[key] === "number" ? (data[key] as number) : 0;
export const ids = (data: RecordData, key: string): string[] =>
  Array.isArray(data[key]) ? (data[key] as string[]) : [];
// Formatters are expensive to create; build each one once per page.
const berlinDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayLabelFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "short",
});
const dayTimeLabelFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const hoursFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
/** Theatre calendar day (Europe/Berlin) as yyyy-MM-dd. */
export const localDate = (date = new Date()) => {
  let year = "",
    month = "",
    day = "";
  for (const part of berlinDay.formatToParts(date)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year.padStart(4, "0")}-${month}-${day}`;
};
export const instantDate = (date: string) =>
  /(?:Z|[+-]\d{2}:\d{2})$/i.test(date)
    ? new Date(date)
    : fromZonedTime(date.length === 10 ? `${date}T00:00:00` : date, "Europe/Berlin");
export const localDateTime = (date: string) =>
  formatInTimeZone(instantDate(date), "Europe/Berlin", "yyyy-MM-dd'T'HH:mm");
export const dateLabel = (date: string, time = false) =>
  date ? (time ? dayTimeLabelFormat : dayLabelFormat).format(instantDate(date)) : "–";
export const weekStart = (date = new Date()) => {
  const day = new Date(`${localDate(date)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
export const shiftDate = (date: string, days: number) => {
  const current = new Date(`${date}T12:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
};
export const hours = (seconds: number) => hoursFormat.format(seconds / 3600);
export const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export const timeAllocations = (data: RecordData): { date: string; seconds: number }[] =>
  Array.isArray(data.dayAllocations)
    ? (data.dayAllocations as { date: string; seconds: number }[])
    : [{ date: value(data, "date"), seconds: num(data, "durationSeconds") }];
