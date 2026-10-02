import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
  type IParagraphOptions,
} from "docx";
import type { JSONContent } from "@tiptap/core";
import sharp from "sharp";
import { safeLink } from "./text-import";

type Run = TextRun | ImageRun | ExternalHyperlink;
async function inline(nodes: JSONContent[]): Promise<Run[]> {
  const result: Run[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") result.push(new TextRun({ break: 1 }));
    else if (node.type === "image") {
      const src = String(node.attrs?.src || "");
      if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(src) || src.length > 2_000_000) continue;
      try {
        const bytes = Buffer.from(src.split(",")[1], "base64");
        const image = sharp(bytes, { limitInputPixels: 40_000_000 });
        const meta = await image.metadata();
        const factor = Math.min(1, 520 / (meta.width || 520), 360 / (meta.height || 360));
        result.push(
          new ImageRun({
            type: "png",
            data: await image.png().toBuffer(),
            transformation: {
              width: Math.round((meta.width || 300) * factor),
              height: Math.round((meta.height || 200) * factor),
            },
            altText: {
              title: "Bild",
              description: String(node.attrs?.alt || ""),
              name: "Dokumentbild",
            },
          }),
        );
      } catch {
        result.push(new TextRun("[Bild konnte nicht exportiert werden]"));
      }
    } else if (node.type === "text") {
      const mark = (name: string) => node.marks?.find((entry) => entry.type === name);
      const run = new TextRun({
        text: node.text || "",
        bold: Boolean(mark("bold")),
        italics: Boolean(mark("italic")),
        strike: Boolean(mark("strike")),
        underline: mark("underline") ? {} : undefined,
        font: mark("code") ? "Consolas" : undefined,
      });
      const href = safeLink(String(mark("link")?.attrs?.href || ""));
      result.push(href ? new ExternalHyperlink({ link: href, children: [run] }) : run);
    } else if (node.content) result.push(...(await inline(node.content)));
  }
  return result;
}
async function blocks(
  nodes: JSONContent[],
  list?: { ordered: boolean; level: number; start: number },
): Promise<(Paragraph | Table)[]> {
  const output: (Paragraph | Table)[] = [];
  for (const [index, node] of nodes.entries()) {
    if (node.type === "table") {
      output.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: await Promise.all(
            (node.content || []).map(
              async (row) =>
                new TableRow({
                  children: await Promise.all(
                    (row.content || []).map(async (cell) => {
                      const content = await blocks(cell.content || []);
                      return new TableCell({
                        children: content.length ? content : [new Paragraph("")],
                        columnSpan: Number(cell.attrs?.colspan) || 1,
                        rowSpan: Number(cell.attrs?.rowspan) || 1,
                        shading: cell.type === "tableHeader" ? { fill: "EDF3EF" } : undefined,
                      });
                    }),
                  ),
                }),
            ),
          ),
        }),
      );
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      output.push(
        ...(await blocks(node.content || [], {
          ordered: node.type === "orderedList",
          level: (list?.level ?? -1) + 1,
          start: Number(node.attrs?.start) || 1,
        })),
      );
    } else if (node.type === "listItem") {
      const children = node.content || [];
      const prefix = list?.ordered ? `${(list.start || 1) + index}. ` : "• ";
      if (children[0]?.type === "paragraph") {
        output.push(
          new Paragraph({
            children: [new TextRun(prefix), ...(await inline(children[0].content || []))],
            indent: { left: 320 * ((list?.level || 0) + 1) },
            spacing: { after: 100 },
          }),
        );
        output.push(...(await blocks(children.slice(1), list)));
      } else output.push(...(await blocks(children, list)));
    } else if (node.type === "blockquote") {
      output.push(...(await blocks(node.content || [])));
    } else if (node.type === "horizontalRule") {
      output.push(
        new Paragraph({
          children: [],
          border: { bottom: { color: "CBD6CF", size: 6, style: "single" } },
        }),
      );
    } else {
      const options: IParagraphOptions = {
        children: await inline(node.content || [node]),
        spacing: { after: 160, line: 280 },
        ...(node.type === "heading"
          ? {
              heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
                Math.max(0, Math.min(2, Number(node.attrs?.level || 1) - 1))
              ],
            }
          : {}),
      };
      output.push(new Paragraph(options));
    }
  }
  return output;
}
export async function exportWord(json: JSONContent, name: string) {
  const children = await blocks(json.content || []);
  return Packer.toBuffer(
    new Document({
      title: name,
      creator: "DigitalMask",
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 22 },
            paragraph: { alignment: AlignmentType.LEFT },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
            },
          },
          children: children.length ? children : [new Paragraph("")],
        },
      ],
    }),
  );
}
