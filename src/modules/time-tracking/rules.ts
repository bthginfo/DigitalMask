import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const THEATER_ZONE = "Europe/Berlin";
export function durationSeconds(start: string, end: string, pause = 0) {
  const a = new Date(start).getTime(),
    b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a)
    throw new Error("Das Ende muss nach dem Beginn liegen.");
  const seconds = Math.round((b - a) / 1000) - pause;
  if (seconds <= 0 || seconds > 86400 * 7) throw new Error("Bitte prüfe Dauer und Pausen.");
  return seconds;
}
export function intervalsOverlap(a: string, b: string, c: string, d: string) {
  return new Date(a) < new Date(d) && new Date(b) > new Date(c);
}
export function localDay(value: string | Date) {
  return formatInTimeZone(value, THEATER_ZONE, "yyyy-MM-dd");
}
export function startOfLocalDay(day: string) {
  return fromZonedTime(`${day}T00:00:00`, THEATER_ZONE);
}
export function splitAcrossDays(
  start: string,
  end: string,
  pauseSeconds = 0,
): { date: string; seconds: number }[] {
  const total = durationSeconds(start, end, pauseSeconds),
    elapsed = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  const result = [];
  let cursor = new Date(start);
  const finish = new Date(end);
  while (cursor < finish) {
    const date = localDay(cursor);
    const noon = new Date(`${date}T12:00:00Z`);
    noon.setUTCDate(noon.getUTCDate() + 1);
    const next = startOfLocalDay(noon.toISOString().slice(0, 10));
    const stop = next < finish ? next : finish;
    result.push({
      date,
      seconds: Math.floor((((stop.getTime() - cursor.getTime()) / 1000) * total) / elapsed),
    });
    cursor = stop;
  }
  if (result.length)
    result[result.length - 1].seconds += total - result.reduce((n, x) => n + x.seconds, 0);
  return result;
}
