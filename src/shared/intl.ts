/** Shared, lazily created Intl formatters. Creating one per call dominates list rendering. */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

export function dateFormat(options: Intl.DateTimeFormatOptions, locale = "de-DE") {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

export function numberFormat(options: Intl.NumberFormatOptions = {}, locale = "de-DE") {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

/** Berlin wall-clock time such as 19:30. */
export const berlinClock = dateFormat({
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});
