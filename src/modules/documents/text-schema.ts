import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";

/** Import, editor and export share the same supported rich-text schema. */
export function textExtensions() {
  return [
    StarterKit.configure({
      undoRedo: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, protocols: ["https", "http", "mailto", "tel"] },
    }),
    TableKit.configure({ table: { resizable: true } }),
    Image.configure({ allowBase64: true, inline: true }),
    TextStyleKit,
  ];
}
export const textSchema = () => getSchema(textExtensions());
