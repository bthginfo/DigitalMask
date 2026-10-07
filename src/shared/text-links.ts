export type TextLinkPart = { text: string; href?: string };

/** Recognise web links without injecting HTML or interpreting executable schemes. */
export function textLinks(text: string): TextLinkPart[] {
  const parts: TextLinkPart[] = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"'`]+/giu;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    let label = match[0].replace(/[.,!?;:»”]+$/u, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]) {
      while (label.endsWith(close) && label.split(close).length > label.split(open).length)
        label = label.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        continue;
      if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
      parts.push({ text: label, href: url.href });
      offset = match.index + label.length;
    } catch {
      // Invalid addresses stay readable as ordinary text.
    }
  }
  if (offset < text.length || !parts.length) parts.push({ text: text.slice(offset) });
  return parts;
}
