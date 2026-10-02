"use client";
import { useEffect } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import type * as Y from "yjs";
import { textExtensions } from "../text-schema";
import { TEXT_FRAGMENT } from "../contracts";
import { TextColorControl } from "./text-color-control";

export function TextEditor({ doc, editable }: { doc: Y.Doc; editable: boolean }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...textExtensions(),
      Collaboration.configure({ document: doc, field: TEXT_FRAGMENT }),
    ],
    editable,
    editorProps: { attributes: { class: "shared-text-content", "aria-label": "Dokumenttext" } },
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      underline: current?.isActive("underline"),
      bullet: current?.isActive("bulletList"),
      ordered: current?.isActive("orderedList"),
      link: current?.isActive("link"),
      color: current?.getAttributes("textStyle").color as string | undefined,
      heading: current?.isActive("heading", { level: 1 })
        ? "1"
        : current?.isActive("heading", { level: 2 })
          ? "2"
          : current?.isActive("heading", { level: 3 })
            ? "3"
            : "0",
    }),
  });
  const controls = [
    { title: "Rückgängig", Icon: Undo2, action: () => editor?.chain().focus().undo().run() },
    { title: "Wiederholen", Icon: Redo2, action: () => editor?.chain().focus().redo().run() },
    {
      title: "Fett",
      Icon: Bold,
      active: selected?.bold,
      action: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      title: "Kursiv",
      Icon: Italic,
      active: selected?.italic,
      action: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      title: "Unterstrichen",
      Icon: Underline,
      active: selected?.underline,
      action: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      title: "Aufzählung",
      Icon: List,
      active: selected?.bullet,
      action: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Nummerierte Liste",
      Icon: ListOrdered,
      active: selected?.ordered,
      action: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "Link",
      Icon: Link2,
      active: selected?.link,
      action: () => {
        const url = window.prompt("Link-Adresse", editor?.getAttributes("link").href || "https://");
        if (url === null) return;
        if (!url.trim()) {
          editor?.chain().focus().extendMarkRange("link").unsetLink().run();
          return;
        }
        if (/^(?:https?:\/\/|mailto:|tel:)/i.test(url.trim()))
          editor?.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
        else window.alert("Bitte verwende eine https://-, http://-, mailto:- oder tel:-Adresse.");
      },
    },
    {
      title: "Tabelle einfügen",
      Icon: Table2,
      action: () =>
        editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ];
  return (
    <div className="shared-text-editor">
      <div className="document-toolbar" role="toolbar" aria-label="Text formatieren">
        <select
          aria-label="Textart"
          value={selected?.heading || "0"}
          disabled={!editable || !editor}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level)
              editor
                ?.chain()
                .focus()
                .toggleHeading({ level: level as 1 | 2 | 3 })
                .run();
            else editor?.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">Normaler Text</option>
          <option value="1">Überschrift 1</option>
          <option value="2">Überschrift 2</option>
          <option value="3">Überschrift 3</option>
        </select>
        {controls.map(({ title, Icon, active, action }) => (
          <button
            key={title}
            className={`document-tool ${active ? "active" : ""}`}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            disabled={!editable || !editor}
            onClick={action}
          >
            <Icon size={18} />
          </button>
        ))}
        <TextColorControl editor={editor} editable={editable} color={selected?.color} />
        {editor?.isActive("table") && (
          <>
            <button
              type="button"
              className="document-tool text-tool"
              disabled={!editable}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              Zeile +
            </button>
            <button
              type="button"
              className="document-tool text-tool"
              disabled={!editable}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              Spalte +
            </button>
            <button
              type="button"
              className="document-tool text-tool"
              disabled={!editable}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              Tabelle entfernen
            </button>
          </>
        )}
      </div>
      <div className="document-paper-scroll">
        <EditorContent editor={editor} className="document-paper" />
      </div>
    </div>
  );
}
