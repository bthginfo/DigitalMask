"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { appDeviceState } from "@/shared/app-device";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export function AppInstall({ onOpenHelp }: { onOpenHelp?: () => void }) {
  const { notify } = useWorkspace();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [needsAppleInstall, setNeedsAppleInstall] = useState(false);
  const [instructions, setInstructions] = useState(false);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const { ios, standalone } = appDeviceState();
      setNeedsAppleInstall(ios && !standalone);
      if (standalone) {
        setInstall(null);
        setInstructions(false);
      }
    };
    const installer = (event: Event) => {
      if (appDeviceState().standalone) return;
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => {
      setInstall(null);
      setInstructions(false);
      setNeedsAppleInstall(false);
    };
    update();
    display.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", installer);
    window.addEventListener("appinstalled", installed);
    return () => {
      display.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", installer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!needsAppleInstall && !install) return null;
  return (
    <>
      <button
        type="button"
        className="text-button app-install-button"
        onClick={async () => {
          if (needsAppleInstall) {
            setInstructions(true);
            return;
          }
          if (!install) return;
          try {
            await install.prompt();
            await install.userChoice;
          } catch {
            notify("Die Installation konnte nicht geöffnet werden. Bitte lade die Seite erneut.");
          } finally {
            setInstall(null);
          }
        }}
      >
        <Download size={15} aria-hidden="true" />
        App installieren
      </button>
      {instructions && (
        <Modal
          title="DigitalMask auf dem iPhone oder iPad"
          className="app-install-dialog"
          onClose={() => setInstructions(false)}
        >
          <p>Öffne DigitalMask in Safari. So legst du die App auf deinen Home-Bildschirm:</p>
          <ol className="app-install-steps">
            <li>
              Tippe in Safari auf <Share size={17} aria-hidden="true" /> <strong>Teilen</strong>. Je
              nach Safari-Ansicht findest du es unter <strong>Mehr (…)</strong>.
            </li>
            <li>
              Wähle <strong>Zum Home-Bildschirm</strong> oder{" "}
              <strong>Zu Home-Bildschirm hinzufügen</strong>.
            </li>
            <li>
              Lass <strong>Als Web-App öffnen</strong> eingeschaltet, falls diese Auswahl erscheint.
              Tippe auf <strong>Hinzufügen</strong>.
            </li>
            <li>Starte DigitalMask danach über das neue App-Symbol.</li>
          </ol>
          <p className="help-note">
            Für Chat-Mitteilungen öffne anschließend in der App Einstellungen → Mitteilungen auf
            diesem Gerät und tippe auf Mitteilungen aktivieren.
          </p>
          <footer className="dialog-footer">
            {onOpenHelp && (
              <Button
                onClick={() => {
                  setInstructions(false);
                  onOpenHelp();
                }}
              >
                Anleitung & Kurzvideos
              </Button>
            )}
            <Button variant="primary" onClick={() => setInstructions(false)}>
              Verstanden
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
