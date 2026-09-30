"use client";
import { useEffect, useId } from "react";
import { Check } from "lucide-react";
import { accentPalettes, type AccentPalette } from "@/shared/contracts";
import { useWorkspace } from "@/components/workspace-context";

export const paletteNames: Record<AccentPalette, string> = {
  green: "Salbei",
  lavender: "Lavendel",
  peach: "Pfirsich",
  sky: "Himmel",
  rose: "Rosé",
  sand: "Sand",
};
export function ProfileAccent() {
  const { workspace } = useWorkspace();
  const palette = workspace.user.preferences?.accentPalette || "green";
  useEffect(() => {
    document.documentElement.dataset.accentOwner = workspace.user.id;
    document.documentElement.dataset.accent = palette;
    return () => {
      delete document.documentElement.dataset.accentOwner;
      delete document.documentElement.dataset.accent;
    };
  }, [palette, workspace.user.id]);
  return null;
}
export function useAccentPreview(palette: AccentPalette) {
  const { workspace } = useWorkspace();
  const saved = workspace.user.preferences?.accentPalette || "green";
  useEffect(() => {
    document.documentElement.dataset.accent = palette;
    return () => {
      // A client-side logout/session expiry must not restore the previous account's preview.
      if (document.documentElement.dataset.accentOwner === workspace.user.id)
        document.documentElement.dataset.accent = saved;
    };
  }, [palette, saved, workspace.user.id]);
}
export function AccentPicker({
  value,
  onChange,
}: {
  value: AccentPalette;
  onChange: (value: AccentPalette) => void;
}) {
  const group = useId();
  return (
    <fieldset className="accent-picker">
      <legend>Deine Akzentfarbe</legend>
      <p className="small muted">
        Dein Arbeitsraum, deine Farbe. Produktions-, Kalender- und Statusfarben bleiben unverändert.
      </p>
      <div className="accent-options">
        {accentPalettes.map((palette) => (
          <label className={`accent-option ${value === palette ? "selected" : ""}`} key={palette}>
            <input
              type="radio"
              name={group}
              value={palette}
              checked={value === palette}
              onChange={() => onChange(palette)}
            />
            <span className={`accent-swatch swatch-${palette}`} aria-hidden="true">
              {value === palette && <Check size={17} />}
            </span>
            <span>
              {paletteNames[palette]}
              {palette === "green" && <span className="small muted">Standard</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
