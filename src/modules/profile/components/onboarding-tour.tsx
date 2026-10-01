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
    text: "Öffne ein Stück, um Team, Aufgaben, Figuren, Bilder und Termine zu sehen. Die Maskenbetreuung steht schon auf der Produktionskarte.",
    tips: [
      "Ihr könnt Produktionen, Kontakte, Figuren und Besetzungen gemeinsam anlegen und bearbeiten.",
      "Figuren und Besetzungen können mehrere Bilder bekommen: zuerst speichern, dann die Galerie nutzen.",
    ],
  },
  {
    module: "tasks",
    title: "Klar verteilen, gemeinsam vorankommen.",
    icon: Layers3,
    text: "Hier stehen allgemeine Aufgaben der Maske. Die Aufgaben eines Stücks findest du in der Produktion. Dort zeigt ein Board den Arbeitsstand; Sprints bündeln Aufgaben für einen Zeitraum.",
    tips: [
      "Aufgaben können Verantwortliche, Unteraufgaben und Checklisten haben.",
      "Am Smartphone kannst du den Status auch im Auswahlfeld der Aufgabe ändern.",
    ],
  },
  {
    module: "documentation",
    title: "Wissen bleibt im Team.",
    icon: BookOpen,
    text: "Aufschriebe sammeln euer Wissen zu einer Schauspielperson. Vorbereitung, Makeup, Haare und Wechsel haben eigene Textfelder. Allgemeine und archivierte Aufschriebe findest du hier gemeinsam.",
    tips: [
      "Der Schauspielerkatalog bündelt Kontakte, Perückenmaße, Hinweise und Fotos.",
      "Ansprechpersonen verwaltest du im Verzeichnis. Dienstübergaben sind ein gemeinsamer Bereich mit Hinweisen und Checklisten.",
    ],
  },
  {
    module: "calendar",
    title: "Gemeinsam planen, persönlich sehen.",
    icon: CalendarDays,
    text: "Wähle die Personen aus, deren Termine du sehen möchtest. Unter Team siehst du eine ganze Woche oder einen Monat gemeinsam. Deinen eigenen Kalender kannst du selbst planen. Termine für andere Personen und die Freigabe freier Tage übernehmen Admins.",
    tips: [
      "Am Smartphone öffnest du die Kalenderauswahl über dem Kalender. Tippe einen Tag an, um Namen und Zeiten zu sehen. Unter Aktionen kannst du den Kalender exportieren oder einen freien Tag wünschen.",
      "Kategorien verwalten Admins. Unter Einstellungen kannst du deinen persönlichen Kalender abonnieren.",
    ],
  },
  {
    module: "time",
    title: "Arbeitszeit ohne Papierstapel.",
    icon: Clock3,
    text: "Zwei Timer erfassen getrennt, wie lange du im Theater bist und woran du arbeitest. Beide dürfen gleichzeitig laufen. Du kannst Zeiten auch später eintragen und korrigieren.",
    tips: [
      "Ohne Internet kannst du Zeiten auf dem Gerät vormerken. Sobald du wieder verbunden bist, kannst du sie speichern.",
      "Unter Produktions- / Arbeitszeiten reichst du deine Tätigkeiten zur Wochenfreigabe ein. Anwesenheit bleibt getrennt.",
    ],
  },
  {
    module: "chat",
    title: "Kurze Wege und Hilfe, wenn du sie brauchst.",
    icon: MessageSquare,
    text: "In Teamkanälen erreichst du die ganze Maske. Admins können weitere Teamkanäle anlegen. Private Chats sind nur für die ausgewählten Personen sichtbar. Absprachen zu einem Stück stehen im Projektchat. Hilfe erklärt dir alle Schritte.",
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
    const main = document.querySelector<HTMLElement>(".main-content");
    main?.setAttribute("data-tour-area", last ? "today" : current.module);
    window.scrollTo({ top: 0, behavior: "instant" });
    let stopped = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (stopped || !matchMedia("(max-width:760px)").matches || last) return;
        const targets: Record<string, string> = {
          productions: ".production-card",
          tasks: ".kanban",
          calendar: ".calendar-board",
          time: ".dual-timers",
          chat: ".chat-layout",
          documentation: ".document-folder",
        };
        const target = targets[current.module]
          ? document.querySelector<HTMLElement>(targets[current.module])
          : null;
        if (target) {
          target.setAttribute("data-tour-example", "true");
          const y = target.getBoundingClientRect().top;
          if (y > 150)
            window.scrollTo({ top: Math.max(0, window.scrollY + y - 110), behavior: "instant" });
        }
      }),
    );
    return () => {
      stopped = true;
      main?.removeAttribute("data-tour-area");
      document
        .querySelectorAll("[data-tour-example]")
        .forEach((node) => node.removeAttribute("data-tour-example"));
    };
  }, [step, navigate, current.module, last]);
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
      className={`onboarding-dialog ${last ? "onboarding-colors" : ""}`}
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
            <ul className="onboarding-tips onboarding-desktop-tips">
              {current.tips.map((tip) => (
                <li key={tip}>
                  <Check size={16} />
                  {tip}
                </li>
              ))}
            </ul>
            <details className="onboarding-mobile-tips">
              <summary>Mehr Hinweise</summary>
              <ul className="onboarding-tips">
                {current.tips.map((tip) => (
                  <li key={tip}>
                    <Check size={16} />
                    {tip}
                  </li>
                ))}
              </ul>
            </details>
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
