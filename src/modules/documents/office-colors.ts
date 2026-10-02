import { load } from "cheerio";

const themeNames = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
];
const fallbackTheme = [
  "FFFFFF",
  "000000",
  "EEECE1",
  "1F497D",
  "4F81BD",
  "C0504D",
  "9BBB59",
  "8064A2",
  "4BACC6",
  "F79646",
  "0000FF",
  "800080",
];
const indexed = [
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "000000",
  "FFFFFF",
  "FF0000",
  "00FF00",
  "0000FF",
  "FFFF00",
  "FF00FF",
  "00FFFF",
  "800000",
  "008000",
  "000080",
  "808000",
  "800080",
  "008080",
  "C0C0C0",
  "808080",
  "9999FF",
  "993366",
  "FFFFCC",
  "CCFFFF",
  "660066",
  "FF8080",
  "0066CC",
  "CCCCFF",
  "000080",
  "FF00FF",
  "FFFF00",
  "00FFFF",
  "800080",
  "800000",
  "008080",
  "0000FF",
  "00CCFF",
  "CCFFFF",
  "CCFFCC",
  "FFFF99",
  "99CCFF",
  "FF99CC",
  "CC99FF",
  "FFCC99",
  "3366FF",
  "33CCCC",
  "99CC00",
  "FFCC00",
  "FF9900",
  "FF6600",
  "666699",
  "969696",
  "003366",
  "339966",
  "003300",
  "333300",
  "993300",
  "993366",
  "333399",
  "333333",
];

export function hexColor(raw: unknown) {
  if (typeof raw !== "string") return undefined;
  const value = raw.replace(/^#/, "");
  return /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
    ? `#${value.slice(-6).toUpperCase()}`
    : undefined;
}
export function themeColors(bytes?: Uint8Array) {
  const colors = [...fallbackTheme];
  if (!bytes) return colors;
  const $ = load(new TextDecoder().decode(bytes), { xmlMode: true });
  const scheme = $("a\\:clrScheme").first();
  for (const [index, name] of themeNames.entries()) {
    const value = scheme.children(`a\\:${name}`).children().first();
    const color = hexColor(value.attr("lastClr") || value.attr("val"));
    if (color) colors[index] = color.slice(1);
  }
  return colors;
}

/** Office tint adjusts HSL luminance, not each RGB channel independently. */
export function tintColor(color: string, tint = 0) {
  if (!tint || !Number.isFinite(tint)) return color;
  const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(...rgb),
    minimum = Math.min(...rgb),
    delta = maximum - minimum;
  let luminance = (maximum + minimum) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * luminance - 1)) : 0;
  let hue = 0;
  if (delta) {
    hue =
      maximum === rgb[0]
        ? ((rgb[1] - rgb[2]) / delta) % 6
        : maximum === rgb[1]
          ? (rgb[2] - rgb[0]) / delta + 2
          : (rgb[0] - rgb[1]) / delta + 4;
    hue = (hue + 6) % 6;
  }
  const amount = Math.max(-1, Math.min(1, tint));
  luminance = amount < 0 ? luminance * (1 + amount) : luminance * (1 - amount) + amount;
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation,
    x = chroma * (1 - Math.abs((hue % 2) - 1)),
    match = luminance - chroma / 2;
  const out =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return (
    "#" +
    out
      .map((value) =>
        Math.round((value + match) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}
export function excelColor(
  value: { argb?: string; theme?: number; indexed?: number; tint?: number } | undefined,
  palette: string[],
) {
  if (!value) return undefined;
  const base =
    hexColor(value.argb) ||
    (value.theme !== undefined
      ? hexColor(palette[value.theme])
      : value.indexed !== undefined
        ? hexColor(indexed[value.indexed])
        : undefined);
  return base ? tintColor(base, value.tint) : undefined;
}
export const safeFontFamily = (value: unknown) =>
  typeof value === "string" && /^[\p{L}\p{N} ,_-]{1,80}$/u.test(value) ? value : undefined;
