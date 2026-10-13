import fontMetrics from "./assets/arial-narrow-metrics.json";
import type { PrintWrapLines } from "./team-month-print-layout";

export const officePrintFont = fontMetrics.family;

/** Office uses its installed font; the server only needs advance widths to avoid clipping. */
export const officePrintLines: PrintWrapLines = (text, width, size, weight) => {
  const advances = fontMetrics.widths[weight >= 700 ? "700" : "400"] as Record<string, number>;
  const measure = (value: string) =>
    Array.from(value).reduce((sum, character) => sum + (advances[character] ?? 1000), 0) *
    (size / fontMetrics.unitsPerEm);
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      const longWord = measure(word) > width;
      if (line && !longWord && measure(candidate) > width) {
        lines.push(line);
        line = "";
      }
      if (!longWord) line = line ? `${line} ${word}` : word;
      else {
        // Use the remainder of the previous line before continuing a long production name.
        if (line) line += " ";
        for (const character of Array.from(word)) {
          if (line && measure(line + character) > width) {
            lines.push(line.trimEnd());
            line = "";
          }
          line += character;
        }
      }
    }
    if (line || !paragraph.trim()) lines.push(line);
  }
  return lines;
};
