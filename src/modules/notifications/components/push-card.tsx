"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Check, Smartphone } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage, Section } from "@/components/ui";
import {
  disablePush,
  enablePush,
  getPushDeviceState,
  testPush,
  type PushDeviceState,
} from "@/modules/notifications/client";

export function PushCard() {
  const { workspace } = useWorkspace();
  const userId = workspace.user.id;
  const [device, setDevice] = useState<PushDeviceState | null>(null);
  const [pending, setPending] = useState<"enable" | "disable" | "test" | "reload" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let current = true;
    getPushDeviceState(userId)
      .then((state) => {
        if (current) setDevice(state);
      })
      .catch((exception: unknown) => {
        if (current)
          setError(
            exception instanceof Error
              ? exception.message
              : "Mitteilungen konnten nicht geladen werden.",
          );
      });
    return () => {
      current = false;
    };
  }, [userId]);

  const run = async (operation: "enable" | "disable" | "test" | "reload") => {
    setPending(operation);
    setError("");
    setNotice("");
    try {
      // Call enablePush directly from the click gesture, before any awaited request.
      if (operation === "enable") await enablePush(userId);
      if (operation === "disable") await disablePush(userId);
      if (operation === "test") await testPush();
      setDevice(await getPushDeviceState(userId));
      setNotice(
        operation === "enable"
          ? "Mitteilungen sind auf diesem Gerät aktiviert."
          : operation === "disable"
            ? "Mitteilungen sind auf diesem Gerät deaktiviert."
            : operation === "test"
              ? "Die Testmitteilung wurde gesendet. Prüfe die Mitteilungen auf deinem Gerät."
              : "Der Gerätestatus wurde aktualisiert.",
      );
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Die Änderung konnte nicht gespeichert werden.",
      );
      try {
        setDevice(await getPushDeviceState(userId));
      } catch {
        // Preserve the original error if the device status cannot be refreshed.
      }
    } finally {
      setPending(null);
    }
  };

  const blocked = device?.permission === "denied";
  const canEnable = device?.supported && device.configured && !device.needsHomeScreen && !blocked;

  return (
    <Section title="Mitteilungen auf diesem Gerät">
      <div className="panel-content push-device-card" aria-busy={!!pending}>
        <div className="push-device-status">
          <span className={`push-device-icon${device?.active ? " is-active" : ""}`}>
            {device?.active ? (
              <BellRing size={23} aria-hidden="true" />
            ) : (
              <Bell size={23} aria-hidden="true" />
            )}
          </span>
          <div>
            <strong>
              {device?.active ? "Du bleibst auf dem Laufenden" : "Auch unterwegs nichts verpassen"}
            </strong>
            <Badge tone={device?.active ? "green" : "neutral"}>
              {!device
                ? error
                  ? "Status nicht verfügbar"
                  : "Status wird geprüft …"
                : device.active
                  ? "Aktiviert"
                  : "Nicht aktiviert"}
            </Badge>
          </div>
        </div>
        <p className="muted">
          Erhalte Mitteilungen bei neuen Chatnachrichten, zugeteilten Aufgaben, Dienständerungen und
          Entscheidungen zu deinen Freiwünschen. Du entscheidest für jedes Gerät einzeln.
        </p>
        <p className="small muted">
          Ungelesene Mitteilungen können als Punkt oder Zahl am App-Symbol erscheinen. Aussehen und
          Anzeige hängen von deinem Handy und seinen Einstellungen ab.
        </p>
        {device?.needsHomeScreen ? (
          <div className="push-device-guidance">
            <Smartphone size={20} aria-hidden="true" />
            <p>
              <strong>Öffne DigitalMask als App.</strong>
              Auf dem iPhone oder iPad: Öffne DigitalMask in Safari, wähle „Teilen“ und „Zum
              Home-Bildschirm“. Starte die App dort und aktiviere die Mitteilungen. Dafür brauchst
              du iOS oder iPadOS 16.4 oder neuer.
            </p>
          </div>
        ) : blocked ? (
          <div className="push-device-guidance">
            <Bell size={20} aria-hidden="true" />
            <p>
              <strong>Mitteilungen sind auf diesem Gerät blockiert.</strong>
              Erlaube Mitteilungen für DigitalMask in den Geräte- oder Browser-Einstellungen. Öffne
              diese Seite danach erneut oder prüfe den Status unten.
            </p>
          </div>
        ) : device && !device.supported ? (
          <p className="push-device-guidance">
            Dieser Browser unterstützt keine Handy-Mitteilungen für DigitalMask. Nutze einen
            aktuellen Browser oder öffne DigitalMask als App auf deinem Home-Bildschirm.
          </p>
        ) : device && !device.configured ? (
          <p className="push-device-guidance">
            Mitteilungen werden gerade eingerichtet. Du kannst sie hier aktivieren, sobald sie
            verfügbar sind.
          </p>
        ) : null}
        <ErrorMessage message={error} />
        {notice && (
          <p className="success-message" role="status">
            <Check size={16} aria-hidden="true" />
            {notice}
          </p>
        )}
        <div className="push-device-actions">
          {device?.active ? (
            <>
              <Button onClick={() => void run("test")} disabled={!!pending}>
                <BellRing size={16} aria-hidden="true" />
                {pending === "test" ? "Sendet …" : "Testmitteilung"}
              </Button>
              <Button variant="ghost" onClick={() => void run("disable")} disabled={!!pending}>
                {pending === "disable" ? "Deaktiviert …" : "Deaktivieren"}
              </Button>
            </>
          ) : canEnable ? (
            <Button variant="primary" onClick={() => void run("enable")} disabled={!!pending}>
              <Bell size={16} aria-hidden="true" />
              {pending === "enable" ? "Aktiviert …" : "Mitteilungen aktivieren"}
            </Button>
          ) : (
            <Button onClick={() => void run("reload")} disabled={!!pending || (!device && !error)}>
              {pending === "reload" ? "Prüft …" : "Status prüfen"}
            </Button>
          )}
        </div>
        <details className="push-device-help">
          <summary>Hinweise für mein Handy</summary>
          <p>
            Auf iPhone und iPad funktioniert dies mit der App auf dem Home-Bildschirm ab iOS oder
            iPadOS 16.4. Unter Android steuert das System den Punkt oder Zähler am App-Symbol. Prüfe
            bei ausbleibenden Mitteilungen auch den Fokusmodus und die Mitteilungseinstellungen
            deines Handys.
          </p>
        </details>
      </div>
    </Section>
  );
}
