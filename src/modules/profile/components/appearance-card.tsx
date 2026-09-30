"use client";
import { useState } from "react";
import type { AccentPalette } from "@/shared/contracts";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Section } from "@/components/ui";
import { ThemeSwitch } from "@/components/theme-switch";
import { AccentPicker, useAccentPreview } from "./accent-picker";

export function AppearanceCard() {
  const { workspace, action, busy } = useWorkspace();
  const saved = workspace.user.preferences?.accentPalette || "green";
  const [palette, setPalette] = useState<AccentPalette>(saved);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useAccentPreview(palette);
  return (
    <Section title="Deine Darstellung">
      <form
        className="panel-content appearance-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setNotice("");
          try {
            await action("profile-update", undefined, { accentPalette: palette });
            setNotice("Deine Akzentfarbe ist in deinem Profil gespeichert.");
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen");
          }
        }}
      >
        <p className="muted">Hell, dunkel oder passend zu deinem Gerät.</p>
        <ThemeSwitch full />
        <AccentPicker
          value={palette}
          onChange={(value) => {
            setPalette(value);
            setNotice("");
          }}
        />
        <div className="appearance-preview">
          <span className="eyebrow">VORSCHAU</span>
          <strong>Alles bereit für deinen Tag.</strong>
          <p className="small muted">
            Die Auswahl färbt Navigation und Bedienelemente. Sie wird erst beim Speichern
            übernommen.
          </p>
        </div>
        <ErrorMessage message={error} />
        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
        <div className="appearance-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            Farbe speichern
          </Button>
          {palette !== saved && (
            <Button
              onClick={() => {
                setPalette(saved);
                setNotice("");
              }}
            >
              Vorschau verwerfen
            </Button>
          )}
        </div>
      </form>
    </Section>
  );
}
