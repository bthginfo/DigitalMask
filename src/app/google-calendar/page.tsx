import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Google Kalender · Datennutzung · DigitalMask",
  description:
    "Welche Daten die optionale Google-Kalender-Verbindung verwendet und wie du sie trennst.",
};

export default function GoogleCalendarInformation() {
  return (
    <main className={styles.page}>
      <Link href="/">← Zurück zu DigitalMask</Link>
      <h1>Google-Kalender-Verbindung</h1>
      <p>
        Die Verbindung ist freiwillig. Du kannst DigitalMask vollständig ohne Google-Konto nutzen.
        Mit der Verbindung überträgst du ausgewählte DigitalMask-Termine in einen bestehenden
        eigenen Google-Kalender. Du kannst mehrere Google-Konten und je Konto mehrere eigene
        Kalender verbinden. Für jeden Zielkalender legst du die Termin-Auswahl getrennt fest.
      </p>
      <section>
        <h2>Welche Daten werden verwendet?</h2>
        <p>
          Bei der Freigabe erhält DigitalMask deine Google-Konto-ID und E-Mail-Adresse zur Zuordnung
          der Verbindung sowie die Liste deiner Kalender für die Zielauswahl. Google erteilt
          Terminrechte für Kalender, deren Eigentümer du bist. DigitalMask nutzt diese
          ausschließlich für die selbst übertragenen Termine im von dir ausgewählten Zielkalender.
          Deine anderen Google-Termine werden nicht eingelesen, ausgewertet oder bearbeitet.
        </p>
        <p>
          Übertragen werden die Titel, Anfangs- und Endzeiten beziehungsweise Tage, Wiederholungen,
          Ausnahmen, Orte, Notizen und Namen der zugeordneten Personen aus den von dir gewählten
          DigitalMask-Kalendern. Die Auswahl kann auf dich, bestimmte Teammitglieder oder das Team
          sowie eine Produktion oder Kalenderart begrenzt werden. Die Termine werden als privat
          angelegt; Personen mit weitergehenden Rechten an deinem Google-Kalender können sie
          entsprechend ihren Google-Berechtigungen sehen.
        </p>
      </section>
      <section>
        <h2>Speicherung und Zweck</h2>
        <p>
          DigitalMask speichert die Kontozuordnung, deinen Zielkalender, deine Auswahl, den letzten
          Abgleich und technische Zuordnungen der selbst angelegten Google-Termine. Zugriffstoken
          und Erneuerungstoken werden mit einem eigenen Schlüssel verschlüsselt in der bestehenden
          DigitalMask-Datenbank gespeichert. Der Schlüssel liegt serverseitig getrennt von den
          Daten. Die Übertragung zu Google erfolgt verschlüsselt.
        </p>
        <p>
          Diese Daten werden ausschließlich für die von dir angeforderte Kalenderverbindung
          verwendet. Sie werden nicht für Werbung, Verkauf, Profilbildung oder das Training von
          KI-Modellen genutzt. Technische Verarbeitung erfolgt auf der bestehenden
          DigitalMask-Infrastruktur bei Vercel und Neon. Die ausgewählten Termine werden an Google
          übertragen und dort nach den Einstellungen deines Kontos verarbeitet.
        </p>
        <p>
          Die Nutzung und Weitergabe von Informationen aus Google-APIs erfolgt gemäß der{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>{" "}
          einschließlich ihrer Anforderungen zur eingeschränkten Nutzung (Limited Use).
        </p>
      </section>
      <section>
        <h2>Ändern und trennen</h2>
        <p>
          Unter Einstellungen → Google Kalender oder im Kalender unter Google Kalender kannst du
          Auswahl und Ziel ändern. Dabei werden ausschließlich die zuvor von dieser Verbindung
          übertragenen Termine entsprechend angepasst oder entfernt. DigitalMask bleibt die Quelle;
          Änderungen in Google werden nicht zurück nach DigitalMask übertragen.
        </p>
        <p>
          Verbindung trennen stoppt den Abgleich, widerruft die Google-Zugriffstoken und löscht die
          gespeicherte Konto- und Terminzuordnung sowie die verschlüsselten Token aus der aktiven
          DigitalMask-Datenbank. Bereits übertragene Termine bleiben in Google erhalten und können
          dort von dir gelöscht werden. Du kannst die Freigabe auch jederzeit in deinen{" "}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
            Google-Kontoverbindungen
          </a>{" "}
          widerrufen. Danach ist kein weiterer Zugriff möglich; zum Entfernen der lokalen Zuordnung
          nutze zusätzlich Verbindung trennen in DigitalMask.
        </p>
        <p>
          Du kannst einen einzelnen Zielkalender trennen, ohne die anderen Kalender zu verändern.
          Google-Konto trennen widerruft den Zugriff für dieses Konto und entfernt alle seine
          lokalen Kalenderzuordnungen. Andere verbundene Google-Konten bleiben erhalten.
        </p>
        <p>
          Fragen oder Probleme kannst du über den Hilfebereich von DigitalMask an den Superadmin
          melden. Den bei Google hinterlegten Supportkontakt siehst du außerdem im
          Google-Freigabedialog. Diese Hinweise beschreiben ausschließlich die optionale
          Google-Verbindung.
        </p>
      </section>
      <p>
        <Link href="/?module=settings">Verbindung in DigitalMask verwalten</Link>
      </p>
    </main>
  );
}
