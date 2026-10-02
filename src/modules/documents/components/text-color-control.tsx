import type { Editor } from "@tiptap/react";
import { Baseline, RotateCcw } from "lucide-react";

function pickerColor(color?: string) {
  if (!color) return "#000000";
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  if (/^#[\da-f]{3}$/i.test(color))
    return "#" + [...color.slice(1)].map((part) => part.repeat(2)).join("");
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  return rgb
    ? "#" +
        rgb
          .slice(1, 4)
          .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
          .join("")
    : "#000000";
}

export function TextColorControl({
  editor,
  editable,
  color,
}: {
  editor: Editor | null;
  editable: boolean;
  color?: string;
}) {
  return (
    <div className="document-color-controls">
      <label className="document-color-control" title="Schriftfarbe">
        <Baseline size={17} aria-hidden="true" />
        <input
          type="color"
          aria-label="Schriftfarbe"
          value={pickerColor(color)}
          disabled={!editable || !editor}
          onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()}
        />
      </label>
      <button
        type="button"
        className="document-tool"
        title="Schriftfarbe zurücksetzen"
        aria-label="Schriftfarbe zurücksetzen"
        disabled={!editable || !editor || !color}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().unsetColor().run()}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
