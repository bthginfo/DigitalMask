"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Layers3,
  MessageSquare,
  Theater,
} from "lucide-react";
import { onboardingVersion, type AccentPalette } from "@/shared/contracts";
import { useWorkspace } from "@/components/workspace-context";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { BrandMark } from "@/components/brand-mark";
import { AccentPicker, useAccentPreview } from "./accent-picker";

const steps = [
  {
    module: "today",
    title: "Dein Tag hinter der Bühne.",
    icon: Check,
    text: "Heute bündelt deine Aufgaben, die nächsten Dienste und deine gebuchte Zeit. Von hier kommst du direkt zu deinem nächsten Arbeitsschritt.",
    tips: [
      "Persönliche Aufgaben öffnen immer den passenden Produktionsarbeitsraum.",
      "Die Suche findet Einträge aus deinen freigegebenen Bereichen.",
    ],
  },
  {
    module: "productions",
    title: "Ein Stück. Ein gemeinsamer Arbeitsraum.",
    icon: Theater,
    text: "In einer Produktion liegen Team und Kontakte, Figuren und Besetzung, Aufgaben, Aufschriebe, Kalender, Zeiten und Projektchat zusammen.",
    tips: [
      "Admins pflegen Produktionen, externe Kontakte und Maskenbetreuungen.",
      "Figuren und Besetzungen können mehrere Bilder bekommen: zuerst speichern, dann die Galerie nutzen.",
    ],
  },
  {
    module: "tasks",
    title: "Klar verteilen, gemeinsam vorankommen.",
    icon: Layers3,
    text: "Jede Produktion hat ihr eigenes Kanban und eigene Sprints. Im Teamboard stehen allgemeine Aufgaben der Maske ohne Produktionszuordnung.",
    tips: [
      "Aufgaben können Verantwortliche, Unteraufgaben und Checklisten haben.",
      "Am Smartphone kannst du den Status auch im Auswahlfeld der Aufgabe ändern.",
    ],
  },
  {
    module: "documentation",
    title: "Wissen bleibt im Team.",
    icon: BookOpen,
    text: "Aufschriebe halten Vorbereitung, Material, Arbeitsablauf und Wechsel nach euren Vorlagen fest. Bilder und Versionsverlauf machen Änderungen nachvollziehbar.",
    tips: [
      "Der Schauspielerkatalog bündelt Kontakte, Perückenmaße, Hinweise und Fotos.",
      "Fundus und Dienstübergaben helfen bei Material und Vorstellungen.",
    ],
  },
  {
    module: "calendar",
    title: "Gemeinsam planen, persönlich sehen.",
    icon: CalendarDays,
    text: "Blende die Kalender anderer Teammitglieder ein und wechsle zwischen Monat, Woche, Tag, Agenda und Teamübersicht. Admins bearbeiten Dienste; Teammitglieder können Freiwünsche stellen.",
    tips: [
      "Exporte übernehmen den aktuellen Zeitraum und die ausgewählten Personen.",
      "Unter Einstellungen kannst du deinen persönlichen Kalender abonnieren.",
    ],
  },
  {
    module: "time",
    title: "Arbeitszeit ohne Papierstapel.",
    icon: Clock3,
    text: "Starte einen Timer oder trage eine Tätigkeit mit Dauer beziehungsweise Beginn, Ende und Pause nach. Produktionszeiten und allgemeine Arbeiten werden zusammengefasst.",
    tips: [
      "Offlineentwürfe werden erst nach ausdrücklicher Synchronisierung gespeichert.",
      "Eine komplette Woche reichst du im allgemeinen Bereich Zeit buchen zur Freigabe ein.",
    ],
  },
  {
    module: "chat",
    title: "Kurze Wege und Hilfe, wenn du sie brauchst.",
    icon: MessageSquare,
    text: "Der allgemeine Kanal verbindet die Maske, der Projektchat bündelt Absprachen zum Stück. In Hilfe findest du Anleitungen, Antworten und einen direkten Weg für Ideen oder Fehlerberichte.",
    tips: [
      "Deine Rückmeldungen findest du dort im eigenen Verlauf.",
      "Du kannst diese Einführung jederzeit aus der Hilfe neu starten.",
    ],
  },
] as const;

export function OnboardingTour({
  navigate,
  onDone,
}: {
  navigate: (module: string) => void;
  onDone: () => void;
}) {
  const { workspace, action, busy } = useWorkspace();
  const [step, setStep] = useState(0);
  const [palette, setPalette] = useState<AccentPalette>(
    workspace.user.preferences?.accentPalette || "green",
  );
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const last = step === steps.length;
  const current = steps[Math.min(step, steps.length - 1)];
  const Icon = current.icon;
  useAccentPreview(palette);
  useEffect(() => {
    navigate(step === steps.length ? "today" : steps[step].module);
    heading.current?.closest("dialog")?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step, navigate]);
  const finish = async (saveColor: boolean) => {
    setError("");
    try {
      await action("profile-update", undefined, {
        onboardingCompleted: true,
        ...(saveColor ? { accentPalette: palette } : {}),
      });
      onDone();
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Deine Einstellungen konnten nicht gespeichert werden.",
      );
    }
  };
  return (
    <Modal
      title="Dein Einstieg in DigitalMask"
      onClose={() => {
        if (!busy) void finish(false);
      }}
      wide
    >
      <div className="onboarding-body" data-onboarding-version={onboardingVersion}>
        <div
          className="onboarding-progress"
          aria-label={`Schritt ${step + 1} von ${steps.length + 1}`}
        >
          <span className="small muted" role="status">
            Schritt {step + 1} von {steps.length + 1}
          </span>
          <div aria-hidden="true">
            {Array.from({ length: steps.length + 1 }, (_, index) => (
              <span key={index} className={index <= step ? "filled" : ""} />
            ))}
          </div>
        </div>
        <div className="onboarding-symbol" aria-hidden="true">
          {last ? <BrandMark /> : <Icon size={28} strokeWidth={1.6} />}
        </div>
        <h3 ref={heading} tabIndex={-1}>
          {last ? "Mach es zu deinem Arbeitsraum." : current.title}
        </h3>
        {last ? (
          <>
            <p className="muted">
              Wähle deine persönliche Akzentfarbe. Du kannst sie später im Profil ändern.
            </p>
            <AccentPicker value={palette} onChange={setPalette} />
          </>
        ) : (
          <>
            <p className="onboarding-copy">{current.text}</p>
            <ul className="onboarding-tips">
              {current.tips.map((tip) => (
                <li key={tip}>
                  <Check size={16} />
                  {tip}
                </li>
              ))}
            </ul>
          </>
        )}
        <ErrorMessage message={error} />
      </div>
      <footer className="dialog-footer onboarding-footer">
        <div className="onboarding-secondary">
          <Button variant="ghost" disabled={busy} onClick={() => void finish(false)}>
            Einführung überspringen
          </Button>
          {step > 0 && (
            <Button disabled={busy} onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} />
              Zurück
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => (last ? void finish(true) : setStep(step + 1))}
        >
          {busy ? "Wird gespeichert …" : last ? "Farbe speichern & loslegen" : "Weiter"}
          <ArrowRight size={16} />
        </Button>
      </footer>
    </Modal>
  );
}
