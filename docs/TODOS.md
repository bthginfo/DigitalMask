# Umsetzungsstand und nächste Module

Die Nutzerergänzungen vom 30. September 2026 werden vollständig umgesetzt. Zwischendeployments erfolgen nach einem abgeschlossenen, geprüften Modul.

## Geprüfter Produktionsumbau

- [x] Produktionsarbeitsräume mit eigenen Aufgaben, Sprints, Kanban, Figuren, Besetzung, mehreren privaten Bildern, Aufschrieben, Kalender, Zeiten, Übergaben und Chat.
- [x] Produktionskontakte mit frei benennbaren Rollen, externen Namen ohne Benutzerkonto und optionaler Maskenpersonen-Auswahl.
- [x] Zusätzliches Produktionsteam und separates Teamboard für Aufgaben ohne Produktionsbezug.
- [x] Passende Exporte, getrennte Produktions-/Teamboard-Daten und geprüfte PDF-Kontakt-/Galerielayouts.
- [x] Passwortanzeige mit Touch-/Tastaturprüfung in Chromium und WebKit.
- [x] Zwischenveröffentlichung auf GitHub/Vercel bestätigen (b7cdca9, anschließend 35 Liveprüfungen bestanden).

## Anwesenheit und Produktionszeit

- [ ] Anwesenheit im Theater getrennt von Arbeitszeit auf Produktionen erfassen.
- [ ] Beide Bereiche manuell nachtragen und bearbeiten; Beginn/Ende auch bei Timerbuchungen korrigieren.
- [ ] Anwesenheit und Produktionsarbeit parallel stoppen/starten, ohne doppelte Buchungen im selben Bereich.
- [ ] Eigene Tages-/Wochensummen, sinnvolle Vergleiche und getrennte Exporte.

## Kalender

- [ ] Teamraster zwischen Woche und Monat umschalten, mit Person, Datum, Tätigkeit, Produktion/Ort und zugänglichen Details.
- [ ] Kategorien von Admins anlegen, bearbeiten und löschen; verwendete Kategorien vor versehentlichem Datenverlust schützen.
- [ ] Standardmäßig zusätzlich Krank, ABF, Ruhetag, halber freier Tag und Urlaub als ganztägige Kategorien ohne Uhrzeiten bereitstellen.
- [ ] Termintitel optional: Produktion als Titel, andernfalls Kategorie als sichtbarer Titel.
- [ ] Monats-Teamübersicht und neue Kategorien in den Druck-/Datenexporten berücksichtigen.

## Kommunikation

- [ ] Direktnachrichten an eine Person und private Gruppen mit ausgewählten Personen anlegen.
- [ ] Teilnehmerrechte für Nachrichten und Dateien serverseitig durchsetzen.
- [ ] Allgemeiner Maskenkanal und Projektchats bleiben verfügbar.

## Profil, Hilfe und Gestaltung

- [x] Minimalistisches Logo statt des einzelnen großen M; App- und Browsericons konsistent aktualisieren.
- [x] Geführtes Onboarding beim ersten aktiven Login, jederzeit erneut im Hilfebereich startbar.
- [x] Sinnvolle FAQ und detaillierte Anleitungen zu den tatsächlichen Funktionen (wird mit den weiteren Modulen aktualisiert).
- [x] Featurewünsche und Fehlermeldungen erfassen; Superadmin erhält eine Übersicht mit Bearbeitungsstatus.
- [x] Superadmin aus Mitarbeiter-Auswahllisten (Kalender, Aufgaben, Produktionsteam usw.) entfernen; Rollenverwaltung bleibt möglich.
- [x] Persönliche Pastell-Akzentfarbe im Profil speichern, Grün als Standard. Auswahl auch am Ende der Tour, Light-/Dark-Kontrast prüfen.

## Übergreifende Anforderungen

- [ ] Neue Abläufe auf Desktop und Smartphone prüfen; Safari-Engine WebKit berücksichtigen.
- [ ] Datenbankabfragen bündeln und cachen; keine zusätzlichen dauerhaften Polls für neue Ansichten.
- [ ] Dokumentation, Migrationen und Rollenprüfungen vervollständigen.
- [ ] Alle Module nach Prüfung auf GitHub pushen und auf Vercel bereitstellen.

## Weitere Produktions- und Dokumentationsänderungen

- [ ] Maskenbetreuung als wichtigste Ansprechperson prominent im Produktionsüberblick, neben dem übrigen Team.
- [ ] Figuren und Schauspieler direkt beim Besetzen anlegen; alternativ freie Figuren-/Besetzungsnamen zulassen.
- [ ] Zentrale Aufschriebe zeigen allgemeine Dokumente und Dokumente aller zugänglichen Produktionen, gruppiert, suchbar und filterbar inklusive Archiv.
- [ ] Sinnvolle gemeinsame Spielzeit- und Jahresfilter für Produktionen, Aufschriebe, Kalender, Aufgaben und Zeitübersichten.
- [ ] Aufschriebanzeige nach Schauspieler; kein manuell erforderlicher Titel, keine Szene/Akt-Auswahl, kein sichtbarer Status.
- [ ] Allgemeine Stückdauer; wiederholbare Textfelder in Vorbereitung (zuerst), Makeup, Haare, Perücken und Bärte, Umbau & Wechsel sowie Einrichten. Alte Dokumente ohne Datenverlust weiterhin lesbar machen.
- [ ] Produktionsübergaben aus Produktionsarbeitsräumen entfernen; allgemeine Dienstübergabe erhalten.
- [ ] Allgemeine Dienstübergaben ohne Produktionszuordnung, Status und Vorstellungsdatum; wiederholbare Textfelder besonders in „Worauf muss ich achten“.
- [ ] Checklisten und vergleichbare Listen global als einzelne hinzufügbare/bearbeitbare/entfernbare Elemente statt Trennzeichen-Textfeldern.
- [ ] Fachliche Kategorien (Fundus/Material, Zeitbuchung, Kalender und Dokumentationsbereiche) verwaltbar machen; genutzte Kategorien und historische Zuordnungen schützen.

## Wiederverwendbare externe Kontakte

- [ ] Eigenes Verzeichnis „Weitere Personen“ für Kontakte ohne Benutzerkonto und ohne Schauspielerkatalog-Zuordnung.
- [ ] Name, Organisation/Funktion, E-Mail, Telefonnummer und Notizen speichern, bearbeiten und löschen (mit Schutz genutzter Zuordnungen).
- [ ] Produktionskontakte mit dem Verzeichnis verknüpfen, direkt dort neue Kontakte anlegen und in weiteren Produktionen wiederverwenden.
- [ ] Rollen bleiben je Produktion frei benennbar; Maskenbetreuung weiter aus dem aktiven Maskenteam oder als freier Name.
- [ ] Kontaktverzeichnis und Produktionskontakte sinnvoll exportieren.
- [ ] Namen der Maskenbetreuung bereits auf den bestehenden Produktionskacheln zeigen; Gestaltung der Kacheln beibehalten.
