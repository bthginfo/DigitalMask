import { load, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";
import { TEXT_FRAGMENT } from "./contracts";
import { hexColor, safeFontFamily, themeColors, tintColor } from "./office-colors";

export type WordTextStyle = Partial<
  Record<"color" | "backgroundColor" | "fontFamily" | "fontSize", string>
>;
export interface WordStyleRange {
  from: number;
  to: number;
  style: WordTextStyle;
}
export interface WordStyleParagraph {
  text: string;
  ranges: WordStyleRange[];
}
const namedColors: Record<string, string> = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  cyan: "00FFFF",
  magenta: "FF00FF",
  darkBlue: "000080",
  darkCyan: "008080",
  darkGreen: "008000",
  darkMagenta: "800080",
  darkRed: "800000",
  darkYellow: "808000",
  darkGray: "808080",
  lightGray: "C0C0C0",
};
const themeIndexes: Record<string, number> = {
  light1: 0,
  dark1: 1,
  light2: 2,
  dark2: 3,
  background1: 0,
  text1: 1,
  background2: 2,
  text2: 3,
  accent1: 4,
  accent2: 5,
  accent3: 6,
  accent4: 7,
  accent5: 8,
  accent6: 9,
  hyperlink: 10,
  followedHyperlink: 11,
};
const xml = (bytes?: Uint8Array) =>
  load(bytes ? new TextDecoder().decode(bytes) : "", { xmlMode: true });
function wordColor(node: Cheerio<Element>, palette: string[], fill = false) {
  const theme = node.attr(fill ? "w:themeFill" : "w:themeColor");
  const base =
    theme && themeIndexes[theme] !== undefined
      ? hexColor(palette[themeIndexes[theme]])
      : hexColor(node.attr(fill ? "w:fill" : "w:val"));
  if (!base) return node.attr("w:val") === "auto" && !fill ? "#000000" : undefined;
  const tint = node.attr(fill ? "w:themeFillTint" : "w:themeTint");
  const shade = node.attr(fill ? "w:themeFillShade" : "w:themeShade");
  return tint && /^[0-9a-f]{2}$/i.test(tint)
    ? tintColor(base, 1 - parseInt(tint, 16) / 255)
    : shade && /^[0-9a-f]{2}$/i.test(shade)
      ? tintColor(base, parseInt(shade, 16) / 255 - 1)
      : base;
}
function runStyle(props: Cheerio<Element>, palette: string[]): WordTextStyle {
  const color = wordColor(props.children("w\\:color").first(), palette);
  const highlight = props.children("w\\:highlight").attr("w:val");
  const backgroundColor =
    hexColor(highlight && namedColors[highlight]) ||
    wordColor(props.children("w\\:shd").first(), palette, true);
  const fontFamily = safeFontFamily(
    props.children("w\\:rFonts").attr("w:ascii") || props.children("w\\:rFonts").attr("w:hAnsi"),
  );
  const size = Number(props.children("w\\:sz").attr("w:val")) / 2;
  return {
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(size >= 4.5 && size <= 72 ? { fontSize: `${size}pt` } : {}),
  };
}

/** Mammoth retains document structure; bounded OOXML ranges supply its omitted run colors. */
export function wordStyleParagraphs(archive: Record<string, Uint8Array>): WordStyleParagraph[] {
  const $ = xml(archive["word/document.xml"]),
    $styles = xml(archive["word/styles.xml"]);
  const palette = themeColors(archive["word/theme/theme1.xml"]);
  const defaults = runStyle($styles("w\\:docDefaults > w\\:rPrDefault > w\\:rPr"), palette);
  const styles = new Map(
    $styles("w\\:style")
      .toArray()
      .map((node) => [node.attribs["w:styleId"], node]),
  );
  const cached = new Map<string, WordTextStyle>();
  function style(id: string | undefined, seen = new Set<string>()): WordTextStyle {
    if (!id || seen.has(id) || seen.size > 20) return {};
    if (cached.has(id)) return cached.get(id)!;
    const node = styles.get(id);
    if (!node) return {};
    seen.add(id);
    const inherited = style($styles(node).children("w\\:basedOn").attr("w:val"), seen);
    const value = { ...inherited, ...runStyle($styles(node).children("w\\:rPr"), palette) };
    cached.set(id, value);
    return value;
  }
  return $("w\\:body w\\:p")
    .toArray()
    .map((paragraph) => {
      const p = $(paragraph),
        props = p.children("w\\:pPr");
      const inherited = { ...defaults, ...style(props.children("w\\:pStyle").attr("w:val")) };
      let text = "";
      const ranges: WordStyleRange[] = [];
      p.find("w\\:r").each((_index, run) => {
        const r = $(run);
        if (r.closest("w\\:p")[0] !== paragraph || r.parents("w\\:del,w\\:moveFrom").length) return;
        const properties = r.children("w\\:rPr");
        const formatting = {
          ...inherited,
          ...style(properties.children("w\\:rStyle").attr("w:val")),
          ...runStyle(properties, palette),
        };
        const value = r
          .children("w\\:t,w\\:tab,w\\:br,w\\:cr")
          .toArray()
          .map((node) =>
            node.name === "w:t" ? $(node).text() : node.name === "w:tab" ? "\t" : "\n",
          )
          .join("");
        if (value && Object.keys(formatting).length)
          ranges.push({ from: text.length, to: text.length + value.length, style: formatting });
        text += value;
      });
      return { text, ranges };
    });
}
const inlineText = (node: JSONContent): string =>
  node.type === "text"
    ? node.text || ""
    : node.type === "hardBreak"
      ? "\n"
      : (node.content || []).map(inlineText).join("");
function paragraphs(json: JSONContent): JSONContent[] {
  return json.type === "paragraph" || json.type === "heading"
    ? [json]
    : (json.content || []).flatMap(paragraphs);
}
export function applyWordFormatting(json: JSONContent, source: WordStyleParagraph[]) {
  const queues = new Map<string, WordStyleParagraph[]>();
  for (const paragraph of source) {
    const queue = queues.get(paragraph.text) || [];
    queue.push(paragraph);
    queues.set(paragraph.text, queue);
  }
  for (const paragraph of paragraphs(json)) {
    const match = queues.get(inlineText(paragraph))?.shift();
    if (!match?.ranges.length) continue;
    let offset = 0;
    paragraph.content = (paragraph.content || []).flatMap((node) => {
      const start = offset;
      offset += inlineText(node).length;
      if (node.type !== "text" || !node.text) return [node];
      const boundaries = [
        ...new Set([
          start,
          offset,
          ...match.ranges
            .flatMap((range) => [range.from, range.to])
            .filter((n) => n > start && n < offset),
        ]),
      ].sort((a, b) => a - b);
      return boundaries.slice(0, -1).map((from, index) => {
        const range = match.ranges.find((entry) => entry.from <= from && entry.to > from);
        const existing = node.marks?.find((mark) => mark.type === "textStyle");
        const marks = [...(node.marks || []).filter((mark) => mark.type !== "textStyle")];
        if (range || existing)
          marks.push({ type: "textStyle", attrs: { ...range?.style, ...existing?.attrs } });
        return {
          ...node,
          text: node.text!.slice(from - start, boundaries[index + 1] - start),
          ...(marks.length ? { marks } : {}),
        };
      });
    });
  }
  return json;
}

/** Upgrade only uniquely matching, unchanged paragraphs. Never replace CRDT text or user marks. */
export function restoreWordFormatting(document: Y.Doc, source: WordStyleParagraph[]) {
  const found: { text: string; pieces: { text: Y.XmlText; from: number }[] }[] = [];
  function visit(element: Y.XmlFragment | Y.XmlElement) {
    if (element instanceof Y.XmlElement && ["paragraph", "heading"].includes(element.nodeName)) {
      let text = "";
      const pieces: { text: Y.XmlText; from: number }[] = [];
      function inline(node: Y.XmlText | Y.XmlElement | Y.XmlHook) {
        if (node instanceof Y.XmlText) {
          pieces.push({ text: node, from: text.length });
          text += node
            .toDelta()
            .map((part: { insert: unknown }) =>
              typeof part.insert === "string" ? part.insert : "",
            )
            .join("");
        } else if (node instanceof Y.XmlElement) {
          if (node.nodeName === "hardBreak") text += "\n";
          else if (node.nodeName !== "image") node.toArray().forEach(inline);
        }
      }
      element.toArray().forEach(inline);
      found.push({ text, pieces });
    } else
      element.toArray().forEach((node) => {
        if (node instanceof Y.XmlElement) visit(node);
      });
  }
  visit(document.getXmlFragment(TEXT_FRAGMENT));
  const sourceCounts = new Map<string, number>(),
    currentCounts = new Map<string, number>();
  source.forEach((p) => sourceCounts.set(p.text, (sourceCounts.get(p.text) || 0) + 1));
  found.forEach((p) => currentCounts.set(p.text, (currentCounts.get(p.text) || 0) + 1));
  const originals = new Map(
    source.filter((p) => sourceCounts.get(p.text) === 1).map((p) => [p.text, p]),
  );
  let changed = 0;
  document.transact(() => {
    for (const current of found) {
      const match = originals.get(current.text);
      if (!current.text || currentCounts.get(current.text) !== 1 || !match) continue;
      for (const piece of current.pieces) {
        let index = 0;
        for (const delta of piece.text.toDelta()) {
          if (typeof delta.insert !== "string") continue;
          const from = piece.from + index,
            to = from + delta.insert.length;
          const existing = Object.fromEntries(
            Object.entries(delta.attributes?.textStyle || {}).filter(
              ([, value]) => value !== null && value !== undefined && value !== "",
            ),
          );
          for (const range of match.ranges) {
            const start = Math.max(from, range.from),
              end = Math.min(to, range.to);
            const attrs = Object.fromEntries(
              Object.entries(range.style).filter(([key]) => !existing[key]),
            );
            if (end > start && Object.keys(attrs).length) {
              piece.text.format(start - piece.from, end - start, {
                textStyle: { ...attrs, ...existing },
              });
              changed++;
            }
          }
          index += delta.insert.length;
        }
      }
    }
  }, "source-format-upgrade");
  return changed;
}

/** A small, shared whitelist for edited/imported run formatting at export boundaries. */
export function textRunStyle(node: JSONContent) {
  const attrs = node.marks?.find((mark) => mark.type === "textStyle")?.attrs || {};
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(String(attrs.fontSize || ""));
  const size = match ? Number(match[1]) * (match[2] === "px" ? 0.75 : 1) : undefined;
  return {
    color: hexColor(attrs.color),
    backgroundColor: hexColor(attrs.backgroundColor),
    fontFamily: safeFontFamily(attrs.fontFamily),
    fontSize: size && size >= 4.5 && size <= 72 ? size : undefined,
  };
}
