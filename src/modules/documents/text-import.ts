import mammoth from "mammoth";
import sharp from "sharp";
import { load } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { textSchema } from "./text-schema";
import { TEXT_FRAGMENT } from "./contracts";
import { HttpError } from "@/platform/http";

const marks: Record<string, string> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  s: "strike",
  del: "strike",
  code: "code",
};
const blocks: Record<string, string> = {
  p: "paragraph",
  blockquote: "blockquote",
  ul: "bulletList",
  ol: "orderedList",
  li: "listItem",
  pre: "codeBlock",
};
export function safeLink(value: string) {
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(value) && !/[\u0000-\u0020]/.test(value)
    ? value
    : "";
}
/** Parse a whitelist of nodes, never render or execute imported HTML. */
export function htmlToTextJson(html: string): JSONContent {
  const $ = load(html);
  $("script,style,iframe,object,embed,svg,math").remove();
  let count = 0;
  function convert(
    nodes: AnyNode[],
    inherited: JSONContent["marks"] = [],
    depth = 0,
  ): JSONContent[] {
    if (depth > 30) throw new HttpError(400, "Dieses Word-Dokument ist zu stark verschachtelt.");
    return nodes.flatMap((node): JSONContent[] => {
      if (++count > 30_000)
        throw new HttpError(413, "Bitte teile das Dokument in kleinere Dateien auf.");
      if (node.type === "text")
        return node.data
          ? [{ type: "text", text: node.data, ...(inherited?.length ? { marks: inherited } : {}) }]
          : [];
      if (node.type !== "tag") return [];
      const element = node as Element,
        tag = element.name;
      if (tag === "br") return [{ type: "hardBreak" }];
      if (tag === "hr") return [{ type: "horizontalRule" }];
      if (tag === "img") {
        const src = element.attribs.src || "";
        return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)
          ? [{ type: "image", attrs: { src, alt: element.attribs.alt || "", title: null } }]
          : [];
      }
      const nextMarks = [...(inherited || [])];
      if (marks[tag]) nextMarks.push({ type: marks[tag] });
      if (tag === "a" && safeLink(element.attribs.href || ""))
        nextMarks.push({
          type: "link",
          attrs: {
            href: safeLink(element.attribs.href),
            target: "_blank",
            rel: "noopener noreferrer nofollow",
          },
        });
      if (tag === "table") {
        const rows = $(element)
          .children("tr,thead,tbody,tfoot")
          .toArray()
          .flatMap((row) => (row.name === "tr" ? [row] : $(row).children("tr").toArray()));
        return [
          {
            type: "table",
            content: rows.map((row) => ({
              type: "tableRow",
              content: $(row)
                .children("td,th")
                .toArray()
                .map((cell) => {
                  let content = convert(cell.children, [], depth + 1);
                  if (
                    !content.length ||
                    content.some((part) => ["text", "image", "hardBreak"].includes(part.type || ""))
                  )
                    content = [{ type: "paragraph", content }];
                  return {
                    type: cell.name === "th" ? "tableHeader" : "tableCell",
                    attrs: {
                      colspan: Math.max(1, Math.min(20, Number(cell.attribs.colspan) || 1)),
                      rowspan: Math.max(1, Math.min(100, Number(cell.attribs.rowspan) || 1)),
                      colwidth: null,
                    },
                    content,
                  };
                }),
            })),
          },
        ];
      }
      const content = convert(element.children, nextMarks, depth + 1);
      if (/^h[1-6]$/.test(tag))
        return [{ type: "heading", attrs: { level: Math.min(3, Number(tag[1])) }, content }];
      if (blocks[tag]) {
        let children = content;
        if (tag === "li" && (!children.length || children[0].type === "text"))
          children = [{ type: "paragraph", content: children }];
        return [
          {
            type: blocks[tag],
            ...(tag === "ol" ? { attrs: { start: Number(element.attribs.start) || 1 } } : {}),
            content: children,
          },
        ];
      }
      return content;
    });
  }
  let content = convert($("body").contents().toArray());
  if (!content.length) content = [{ type: "paragraph" }];
  if (content.some((node) => ["text", "hardBreak", "image"].includes(node.type || "")))
    content = [{ type: "paragraph", content }];
  return { type: "doc", content };
}
export async function importWord(bytes: Buffer) {
  let imageBytes = 0;
  const result = await mammoth.convertToHtml(
    { buffer: bytes },
    {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        if (!/^image\/(?:png|jpeg|webp|gif|tiff|bmp)$/.test(image.contentType)) return { src: "" };
        try {
          const pipeline = sharp(await image.readAsBuffer(), {
            limitInputPixels: 40_000_000,
          }).resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true });
          const transparent = (await pipeline.metadata()).hasAlpha;
          const data = await (
            transparent ? pipeline.png() : pipeline.jpeg({ quality: 86, mozjpeg: true })
          ).toBuffer();
          imageBytes += data.length;
          if (imageBytes > 1_200_000) return { src: "" };
          return {
            src: `data:image/${transparent ? "png" : "jpeg"};base64,${data.toString("base64")}`,
          };
        } catch {
          return { src: "" };
        }
      }),
    },
  );
  const document = prosemirrorJSONToYDoc(textSchema(), htmlToTextJson(result.value), TEXT_FRAGMENT);
  const warnings = [
    "Text, Überschriften, Listen, Bilder und einfache Tabellen werden übernommen. Seitenlayout, Kopf-/Fußzeilen und besondere Word-Funktionen können abweichen. Das Original bleibt verfügbar.",
  ];
  if (imageBytes > 1_200_000)
    warnings.push(
      "Einige große Bilder wurden nicht übernommen. Sie sind weiterhin im Original enthalten.",
    );
  return { document, warnings };
}
