# Umsetzungsstand

Das Releasepaket enthält die Nutzerergänzungen vom 30. September 2026. Die Module wurden gezielt geprüft; unabhängige Designprüfungen für die neue Oberfläche und Drucklayouts sind bestanden.

## Geprüfter Produktionsumbau

- [x] Produktionsarbeitsräume mit eigenen Aufgaben, Sprints, Kanban, Figuren, Besetzung, mehreren privaten Bildern, Aufschrieben, Kalender, Zeiten, Übergaben und Chat.
- [x] Produktionskontakte mit frei benennbaren Rollen, externen Namen ohne Benutzerkonto und optionaler Maskenpersonen-Auswahl.
- [x] Zusätzliches Produktionsteam und separates Teamboard für Aufgaben ohne Produktionsbezug.
- [x] Passende Exporte, getrennte Produktions-/Teamboard-Daten und geprüfte PDF-Kontakt-/Galerielayouts.
- [x] Passwortanzeige mit Touch-/Tastaturprüfung in Chromium und WebKit.
- [x] Zwischenveröffentlichung auf GitHub/Vercel bestätigen (b7cdca9, anschließend 35 Liveprüfungen bestanden).

## Anwesenheit und Produktionszeit

- [x] Anwesenheit im Theater getrennt von Arbeitszeit auf Produktionen erfassen.
- [x] Beide Bereiche manuell nachtragen und bearbeiten; Beginn/Ende auch bei Timerbuchungen korrigieren.
- [x] Anwesenheit und Produktionsarbeit parallel stoppen/starten, ohne doppelte Buchungen im selben Bereich.
- [x] Eigene Tages-/Wochensummen, sinnvolle Vergleiche und getrennte Exporte.

## Kalender

- [x] Teamraster zwischen Woche und Monat umschalten, mit Person, Datum, Tätigkeit, Produktion/Ort und zugänglichen Details.
- [x] Kategorien von Admins anlegen, bearbeiten und löschen; verwendete Kategorien vor versehentlichem Datenverlust schützen.
- [x] Standardmäßig zusätzlich Krank, ABF, Ruhetag, halber freier Tag und Urlaub als ganztägige Kategorien ohne Uhrzeiten bereitstellen.
- [x] Termintitel optional: Produktion als Titel, andernfalls Kategorie als sichtbarer Titel.
- [x] Monats-Teamübersicht und neue Kategorien in den Druck-/Datenexporten berücksichtigen.

## Kommunikation

- [x] Direktnachrichten an eine Person und private Gruppen mit ausgewählten Personen anlegen.
- [x] Teilnehmerrechte für Nachrichten und Dateien serverseitig durchsetzen.
- [x] Allgemeiner Maskenkanal und Projektchats bleiben verfügbar.

## Profil, Hilfe und Gestaltung

- [x] Minimalistisches Logo statt des einzelnen großen M; App- und Browsericons konsistent aktualisieren.
- [x] Geführtes Onboarding beim ersten aktiven Login, jederzeit erneut im Hilfebereich startbar.
- [x] Sinnvolle FAQ und detaillierte Anleitungen zu den tatsächlichen Funktionen (wird mit den weiteren Modulen aktualisiert).
- [x] Featurewünsche und Fehlermeldungen erfassen; Superadmin erhält eine Übersicht mit Bearbeitungsstatus.
- [x] Superadmin aus Mitarbeiter-Auswahllisten (Kalender, Aufgaben, Produktionsteam usw.) entfernen; Rollenverwaltung bleibt möglich.
- [x] Persönliche Pastell-Akzentfarbe im Profil speichern, Grün als Standard. Auswahl auch am Ende der Tour, Light-/Dark-Kontrast prüfen.

## Übergreifende Anforderungen

- [x] Neue Abläufe auf Desktop und Smartphone prüfen; Safari-Engine WebKit berücksichtigen.
- [x] Datenbankabfragen bündeln und cachen; keine zusätzlichen dauerhaften Polls für neue Ansichten.
- [x] Dokumentation, Migrationen und Rollenprüfungen vervollständigen.

Die Bereitstellung erfolgt nach den Releaseprüfungen über GitHub und die bestehende Vercel-Anbindung. Der tatsächliche READY-Zustand wird anschließend kontrolliert.

## Weitere Produktions- und Dokumentationsänderungen

- [x] Maskenbetreuung als wichtigste Ansprechperson prominent im Produktionsüberblick, neben dem übrigen Team.
- [x] Figuren und Schauspieler direkt beim Besetzen anlegen; alternativ freie Figuren-/Besetzungsnamen zulassen.
- [x] Zentrale Aufschriebe zeigen allgemeine Dokumente und Dokumente aller zugänglichen Produktionen, gruppiert, suchbar und filterbar inklusive Archiv.
- [x] Sinnvolle gemeinsame Spielzeit- und Jahresfilter für Produktionen, Aufschriebe, Kalender, Aufgaben und Zeitübersichten.
- [x] Aufschriebanzeige nach Schauspieler; kein manuell erforderlicher Titel, keine Szene/Akt-Auswahl, kein sichtbarer Status.
- [x] Allgemeine Stückdauer; wiederholbare Textfelder in Vorbereitung (zuerst), Makeup, Haare, Perücken und Bärte, Umbau & Wechsel sowie Einrichten. Alte Dokumente ohne Datenverlust weiterhin lesbar machen.
- [x] Produktionsübergaben aus Produktionsarbeitsräumen entfernen; allgemeine Dienstübergabe erhalten.
- [x] Allgemeine Dienstübergaben ohne Produktionszuordnung, Status und Vorstellungsdatum; wiederholbare Textfelder besonders in „Worauf muss ich achten“.
- [x] Checklisten und vergleichbare Listen global als einzelne hinzufügbare/bearbeitbare/entfernbare Elemente statt Trennzeichen-Textfeldern.
- [x] Fachliche Kategorien (Fundus/Material, Zeitbuchung, Kalender und Dokumentationsbereiche) verwaltbar machen; genutzte Kategorien und historische Zuordnungen schützen.

## Wiederverwendbare externe Kontakte

- [x] Eigenes Verzeichnis „Weitere Personen“ für Kontakte ohne Benutzerkonto und ohne Schauspielerkatalog-Zuordnung.
- [x] Name, Organisation/Funktion, E-Mail, Telefonnummer und Notizen speichern, bearbeiten und löschen (mit Schutz genutzter Zuordnungen).
- [x] Produktionskontakte mit dem Verzeichnis verknüpfen, direkt dort neue Kontakte anlegen und in weiteren Produktionen wiederverwenden.
- [x] Rollen bleiben je Produktion frei benennbar; Maskenbetreuung weiter aus dem aktiven Maskenteam oder als freier Name.
- [x] Kontaktverzeichnis und Produktionskontakte sinnvoll exportieren.
- [x] Namen der Maskenbetreuung bereits auf den bestehenden Produktionskacheln zeigen; Gestaltung der Kacheln beibehalten.

## Weiteres Gestaltungsfeedback

- [x] Einführung zeigt die erklärte Modulansicht ohne unscharfen Hintergrund; einfache Texte und erneutes Starten prüfen.
- [x] Neues minimalistisches Logo, da die erste Variante nicht gefällt.
- [x] Produktionsübersicht standardmäßig nach Premiere sortieren, andere Sortierungen auswählbar.

## Live-Synchronisierung und Kontaktverknüpfung

- [x] Änderungen anderer Personen und Chatnachrichten über SSE/Redis statt regelmäßiger Neon-Abfragen empfangen.
- [x] Verbindungsstatus und Wiederverbindung; Ereignisse bündeln, Hintergrundtabs pausieren, Reconnects ohne Neon-Zugriff autorisieren.
- [x] Kanalauswahl mit getrennten Team-/Produktions-/Direkt-/Gruppenchats und mobilem Kanalwechsler.
- [x] Bestehende Kontaktdubletten zusammenführen und alle Produktionsverknüpfungen erhalten.
- [x] Neue Kontakte wiederverwenden; doppelte manuelle Kontakte beim Speichern verhindern.
- [x] Bei Adminfreigabe neue Maskenteamkonten eindeutig mit bisherigen Maskenkontakten verknüpfen, einschließlich Nachnameninitialen; Produktionsrollen und Teamzuordnungen aktualisieren, Kontaktdetails erhalten.

## Zeitkorrekturen und Kalenderauswahl

- [x] Produktionszeiten und Anwesenheit für alle Rollen nachträglich bearbeiten; eigene Buchungen für Mitglieder, fremde Buchungen für Admins.
- [x] Geänderte Produktionszeiten öffnen betroffene eingereichte/freigegebene Wochen automatisch zur erneuten Prüfung; Konflikte mit veralteten Freigaben abfangen.
- [x] Beim Nachtragen das Enddatum zunächst am gewählten Starttag halten; ausdrücklich abweichende Enddaten erhalten.
- [x] Persönlicher Kalender beginnt mit der eigenen Person; leere Auswahl zeigt keine Einträge, „Alle anzeigen“ ist ausdrücklich auswählbar.
- [x] Teamansicht beginnt mit allen aktiven Teammitgliedern; danach die vorherige persönliche Auswahl wiederherstellen. Exporte übernehmen dieselbe Auswahl.
- [x] Teamliste getrennt von Fachdaten zwischenspeichern und gezielt bei Änderungen invalidieren.

## QA-Nachbereitung

Nach den abschließenden Liveprüfungen werden die angelegten QA-Konten, Testeinträge und Testdateien aus der produktiven Umgebung entfernt. Automatische Testdefinitionen bleiben für spätere Änderungen erhalten.
