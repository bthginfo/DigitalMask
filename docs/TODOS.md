# Umsetzungsstand

## Aktuelle Ergänzungen: Zeiten, Druckpläne und Bedienung

- [x] Produktionszeiten für Admins mit Auswahl „Alle“ je Person aufteilen, einschließlich älterer Wochen und Export.
- [x] Zeiten direkt speichern, ohne wöchentliches Einreichen oder Freigabe.
- [x] Allgemeines Nachtragen mit heutigem Datum beginnen; gezielt gewählte Tage übernehmen und den Wochenkontext erst nach Speichern wechseln.
- [x] Änderungsverlauf und allgemeines Rückgängig entfernen; Kontextnavigation und normales Dokument-Rückgängig erhalten. Keine historischen Produktivdaten löschen.
- [x] Gespeicherte Maskenpläne kompakt und vollständig darstellen; Bearbeitungsansicht weiterhin großzügig.
- [x] Maskenplan als vier vollständige kleine Tabellen auf A4 ausgeben, ohne doppelte Ablauf-/Hinweislisten oder Berichtskopf.
- [x] Kalender-Excel an Lenas Vorlage anpassen: 35-pt-Zeilen, Calibri 11/12/14, feste Breiten, Außenrahmen, Ränder und 74-%-Druckmaßstab. PDF mit entsprechenden Proportionen und vollflächigen Farben; lange Inhalte fortsetzen statt abschneiden.
- [x] Eingegebene Weblinks in Chats, Detailfeldern, Aufschrieben, Notizen und weiteren Lesebereichen sicher anklickbar machen.
- [x] Excel-Formeln bei gemeinsamem Bearbeiten und Herunterladen erhalten; geteilte Formeln und besondere Array-/Spill-Funktionen berücksichtigen, statt alte Ergebnisse als neue Berechnung auszugeben.
- [x] Bayerische Feiertage für Ingolstadt dezent in allen Kalenderansichten anzeigen; kein Blockieren, kein zusätzlicher Termineintrag und keine automatische Zeitgutschrift.
- [x] Wochenstunden und sechs Solltage im Profil hinterlegen, für Admins auch bei Kolleginnen. Startsaldo und datierte Solländerungen berücksichtigen.
- [x] Stundenkonto aus Anwesenheit separat von Produktionszeiten berechnen; Urlaub/Krank anteilig anrechnen, ABF/Ruhetag/halben freien Tag nicht. Gesamt, Woche, Monat und Zeitraum anzeigen.
- [x] Fokussierte Druck-/Mobilprüfung, Typprüfung, Lint und 64 Fachtests bestehen; additive Migration 0013 einspielen und das Release für GitHub/Vercel vorbereiten.

Die unabhängige Prüfung auf Handy und Desktop ist bestanden. Wochen-/Monatsdruckpläne und vier Maskenplan-Kopien wurden als echte A4-PDFs geprüft und visuell kontrolliert. Migration 0013 ergänzt ausschließlich die Profileinstellungen um die Wochenstunden. Produktionsbuild und Live-Domain werden nach dem Push gegen den veröffentlichten Commit geprüft.

## Kontextnavigation und Teamabläufe

- [x] Rücknavigation und Browser-Zurück mit Produktionsreiter, Zeitraum, Suche, Sortierung, Filtern und Scrollposition erhalten.
- [x] Perücken und andere Fundusartikel nach Zeitraum und Menge reservieren; Verfügbarkeit, Bearbeitung, Stornierung und Überschneidungen sicher prüfen.
- [x] Diensttausch mit Zustimmung beider Beteiligten und anschließender Adminfreigabe anlegen; Kalender erst nach atomarer Konfliktprüfung ändern.
- [x] Hilfe, passende Exporte und fokussierte Fach-/Browserprüfungen ergänzen, Migration und Produktionsbuild prüfen und das Releasepaket vorbereiten; temporäre Prüfdaten entfernen.

Neue Planungseinträge verwenden den vorhandenen Record-Speicher, Cache und Live-Signale. Navigation, Ansichtsfilter und Stundenkontoberechnung bleiben lokal. Wochenstunden werden in den bestehenden gebündelten Mitgliederabfragen geladen.

Dateilöschungen verwenden die vorhandene Outbox zur Speicherbereinigung. Bereits eingereihte ältere Löschaufträge bleiben ausführbar. Audit- und Live-Ereignisse bleiben erhalten; zusätzliche Rückgängig-Snapshots und Verlaufsabfragen entfallen.

Lint, Typprüfung, Produktionsbuild und Migration 0012 sind bestanden. 276 Fachtests sind geprüft; eine bestehende lange PDF-Prüfung überschritt unter paralleler Last ihr Zeitlimit und ist danach einzeln bestanden. Temporäre Aufgaben-/Browserfixtures sind entfernt, ohne künstliche Produktionsdaten anzulegen. Zwei reine Ergebnisvorschauen bleiben im ignorierten Artefaktordner.

## Aktuelle Mitteilungen und verlässliche Premieren-Sortierung

- [x] In Glocke und Neu für dich nur eigene ungelesene Mitteilungen anzeigen, nach Erstellung absteigend sortieren und gelesene aus den sichtbaren Listen entfernen.
- [x] Premieren ohne Trennung in vergangene/kommende Stücke chronologisch sortieren, früheste zuerst und Stücke ohne Datum zuletzt; Produktionsauswahl im Kalender angleichen.
- [x] Hilfe aktualisieren und die bestehenden Grenzfallprüfungen an die bestätigte Sortierung anpassen.
- [x] Gezielte Funktionskontrolle und Produktionsbuild abschließen; das Releasepaket für GitHub und Vercel vorbereiten.

Beide Sortierungen verwenden ausschließlich die bereits geladenen Daten. Das Lesen einer Mitteilung nutzt die vorhandene Bestätigung; neue Datenbankabfragen oder automatische Löschjobs werden nicht eingeführt.

## Kalender: mehr Platz und mobile Teamdetails

- [x] Obere Scrollleiste in Teamwoche und Teammonat mit der unteren synchronisieren und nach Layoutwechseln nutzbar halten.
- [x] Kalender-Seitenleiste am Desktop einklappbar machen und eine Kalender-Vollbildansicht mit Rückkehrschaltfläche und Escape ergänzen.
- [x] Tagesdienste als Hintergrund über ihre volle Zeitspanne darstellen; normale Termine bleiben darüber erreichbar.
- [x] Mobile Teamwoche und Teammonat als kompakte Tabelle mit festen Namen, seitlichem Scrollen sowie sichtbaren Terminen und Uhrzeiten anzeigen.
- [x] Anleitung aktualisieren, gezielte Funktions- und Darstellungsprüfung bestehen und das Releasepaket vorbereiten.

Ansichtsschalter und Scrollleisten verwenden den bereits geladenen Kalender im Browser und benötigen keine weiteren Datenbankabfragen.

Die unabhängige Designprüfung ist bestanden. Die gezielten Browserprüfungen decken die obere Maus-Scrollleiste, Filterauswahl nach Einklappen, Vollbild mit Escape und Fokusrückkehr, überlagerte Termine sowie Teamwoche und Teammonat bei 375 px ab. Ein achtstündiger Tagesdienst bleibt über die gesamte Zeitspanne sichtbar. Zwölf Sortierungs-/Benachrichtigungstests, Lint und der Produktionsbuild sind bestanden; die Prüfung arbeitet ausschließlich mit fiktiven Daten.

## Teamkalender: platzsparende PDF- und Excel-Druckpläne

- [x] PDF-Kopf auf die Kalenderwoche reduzieren; Titel und Zeiten sämtlicher Termine direkt im Raster mit vollflächigen Farben drucken, ohne Agenda-Zähler oder gekürzte Titel.
- [x] Teammonat als zwei Monatshälften in A4-Querformat drucken; einheitliche Schriftgrößen und vollständige Inhalte erhalten. Dichte Belegung wird auf weitere Rasterseiten aufgeteilt.
- [x] Excel-Teammonat als farbige Monatsmatrix mit Personen links und zwei Monatshälften untereinander ausgeben; keine Agenda als Hauptdarstellung. Mehrere Termine erhalten getrennte farbige Zellen, Namen bleiben links fixiert.
- [x] Anleitung und Exportdokumentation angleichen; vorhandene Prüfungen auf die vollständigen Druckpläne umstellen und einen echten Fünf-Personen-/Zwei-KW-Export prüfen.
- [x] Erzeugte PDF-Seiten visuell prüfen, gezielte Exportprüfungen und Produktionsbuild bestehen und das Releasepaket vorbereiten.

Die Exportmodule arbeiten weiterhin ausschließlich mit dem bereits autorisierten Daten-Snapshot und benötigen weder zusätzliche Datenbankabfragen noch externe Schrift- oder Bildabrufe.

Drei gezielte Exportfälle prüfen die Personenauswahl, sämtliche 31 Tage bei 13 Personen sowie fünf Mitarbeitende plus Gästespalte über beide Monatshälften. PDF-Inhalte, A4-Seitenmaße und die tatsächliche Excel-Datei mit 70 gefärbten Termineinträgen sind geprüft; die erzeugten PDF-Seiten wurden auch visuell kontrolliert. Die spätere Anpassung an Lenas Excel-Vorlage verwendet einheitliche Monatshälften statt gepaarter Wochen. Der ergänzende lokale Office-Druckstart war nicht verfügbar und ist keine Voraussetzung für den Export. Das veröffentlichte Release wird vor Abschluss gegen den Git-Stand geprüft; temporäre Browserdaten, Arbeitsmappen und Rohbilder werden anschließend entfernt.

## Maskenplan: Speicher-Hotfix und kompakte Tabelle

- [x] Speichern vorhandener Pläne mit unveränderten früheren Personal- oder Besetzungszuordnungen ermöglichen; neue Zuordnungen, Produktionsrechte und Versionskonflikte weiterhin prüfen.
- [x] Neuanlage, direkt anschließendes Bearbeiten und mobile Speichern-Aktionen gezielt prüfen; Hotfix vorrangig veröffentlichen.
- [x] Anschließend die zusätzliche Listenansicht entfernen und gespeicherte Pläne als kompakte Tabelle darstellen, mit deutlich erreichbarer Bearbeitung.
- [x] Anleitung und betroffenen Kurzclip anpassen, gezielt prüfen und die Darstellungsänderung veröffentlichen.

Der Speicher-Hotfix ist separat als abfde53 veröffentlicht. 17 gezielte Fach-/Speichertests, ein Browserregressionstest, Typprüfung, Lint und die unabhängige UI-Prüfung sind bestanden. Die Vercel-Logs zeigen erfolgreiche Neuanlagen, aber keinen konkreten fehlgeschlagenen Speicherversuch von Lena; die behobenen Referenz- und Bedienfehler wurden mit fiktiven Daten reproduziert.

Die kompakte Tabelle und die Bearbeitung haben die unabhängige Designprüfung bestanden. Elf gezielte Browserfälle decken Handy-/Desktopansichten, Speichern, Serverfehler und Versionskonflikte, Kataloglinks, lange Namen sowie Drag und langes Halten ab. Der aktualisierte Hilfeclip dauert 25 Sekunden und benötigt 278.995 Bytes; Bild und Texte sind an der tatsächlichen Videodauer ausgerichtet. Ansichtswechsel benötigen keine zusätzlichen Datenbankabfragen.

## Lenas Kalenderfeedback

- [x] Teamkalender in der bestätigten Reihenfolge Laura, Katharina, Janine, Julia Gottlöber, Julia John, Magdalena und Gäste/Aushilfen anzeigen; weitere aktive Personen vor der Gästespalte einordnen.
- [x] Breite Teamtabellen oben und unten synchron seitlich scrollen lassen; die mobile Monatsansicht erhalten.
- [x] Tagesdienste als ruhigen Hintergrund darstellen und Termine darin ermöglichen, einschließlich serverseitiger Konfliktprüfung.
- [x] Halbe freie Tage als nicht sperrende Hinweise behandeln; echte Abwesenheiten und Terminkonflikte weiterhin prüfen.
- [x] Gäste/Aushilfen dauerhaft in der Teamplanung anbieten; Adminrechte, Personenauswahl und passende Exporte erhalten.
- [x] Produktionsauswahl im Kalender nach Premiere sortieren und Kalender-Vorschläge ohne doppelte Stunden aus überlagerten Diensten berechnen.
- [x] Hilfe aktualisieren, gezielt auf Smartphone und Desktop prüfen, anschließend pushen und veröffentlichen; temporäre Prüfdaten entfernen.

46 gezielte Kalender-, Rechte-, Vorschlags- und Exporttests sowie die unabhängige Designprüfung sind bestanden. Die aktuelle Hilfe und die kompakte Maskenplantabelle werden zusammen mit den Kalenderänderungen veröffentlicht. Temporäre Browserdaten und Rohaufnahmen werden nach der Prüfung der veröffentlichten Version entfernt; Produktionsdatensätze wurden für diese Prüfungen nicht angelegt.

## Mobile Bedienung und nachvollziehbare Zeitbuchungen

- [x] Anwesenheit und Produktionsarbeit mit aufklappbarem Wochenverlauf, ISO-Kalenderwochen, Summen und direktem Bearbeiten älterer Buchungen anzeigen.
- [x] Frühere/nächste Wochen leicht auswählen; widersprüchliche Jahr-/Spielzeitfilter beim Wochenwechsel vermeiden und frühere Spielzeiten erreichbar halten.
- [x] Geplante Kalenderzeiten als ungeprüfte Vorschläge anbieten, vor dem Buchen anpassbar und ausdrücklich zu bestätigen; freie/ganztägige Termine, Zukunft und Doppelbuchungen berücksichtigen.
- [x] ABF, Ruhetag und weitere ganztägige Kennzeichnungen in Wochenübersicht und Verlauf aufnehmen; eigene Tage leicht kennzeichnen und sinnvolle Wochenexporte ergänzen, ohne Arbeitsstunden zu erfinden.
- [x] Beide unabhängigen Timer am Smartphone kompakt und mit sichtbarem Laufzustand darstellen; manuelles Nachtragen und Einträge leichter erreichbar machen.
- [x] Mobile Überschriften, Nebenaktionen und Jahr-/Spielzeitfilter verdichten; Produktionskarten und Desktopansichten erhalten.
- [x] Alle Produktionsbereiche über eine eindeutig beschriftete mobile Auswahl erreichbar halten.
- [x] Teamaufgaben mobil als nach Status gegliederte Liste anbieten; Kanban als Alternative erhalten.
- [x] Vollständige Tagesdetails im mobilen Monatskalender zugänglich machen, einschließlich Teamansicht und bestehender Schreibrechte.
- [x] Lange Formulare mit erreichbaren Speichern-/Abbrechen-Aktionen und sinnvoller Nutzung der Tastaturhöhe verbessern.
- [x] Anleitungen, FAQ und betroffene Kurzvideos anpassen; Datumsfälle und Handy-/Desktopdarstellung gezielt prüfen, Releasepaket für GitHub/Vercel fertigstellen und temporäre Prüfdateien entfernen.

Die historischen Zeitdaten sind bereits Teil des freigegebenen, zwischengespeicherten Arbeitsraums. Wochenverlauf und Kalender-Vorschläge werden ausschließlich daraus berechnet. Geplante Kalenderzeiten sind keine bestätigten Arbeitszeiten und werden erst durch ausdrückliches Speichern zur Buchung. Die Erweiterung benötigt keine zusätzlichen Abfragen, Polls, Cronjobs oder Datenbanktabellen.

Die unabhängige Designprüfung ist bestanden. 48 gezielte Zeit-, Kalender- und Exporttests sowie Handyansichten bei 375/390/432 px, Desktop, Tastaturhöhe und Fokusabläufe sind geprüft. Die zwölf aktiven Hilfeclips einschließlich Poster und Textspuren benötigen 3,78 MB; sie laden erst nach Benutzeraktion und nutzen statische Vercel-Dateien.

## Mehr Platz für den mobilen Chat

- [x] Große mobile Überschrift und doppelte Kanalbenennung durch eine kompakte Kopfzeile mit Kanalwechsel ersetzen.
- [x] Neue Chats, Export, Verwaltung und Verbindungswiederherstellung unter Chataktionen erreichbar halten; Rollen beibehalten.
- [x] Einzeiliges, begrenzt wachsendes Eingabefeld mit Plus-Menü für Dateien/Dokumente und direktem Senden; beschriftete 44-px-Touchflächen.
- [x] Tatsächlich verfügbare Bildschirmhöhe einschließlich Tastatur und unterer Navigation nutzen; globalen Chatfooter nur mobil ausblenden.
- [x] Hilfe und privaten Chatclip an den neuen Ablauf anpassen, vorhandene veröffentlichte Medien erhalten.
- [x] Schmale Smartphones, Dark Mode, Produktion und Desktop gezielt prüfen; Release vorbereiten und Rohmaterial entfernen.

Der Nachrichtenverlauf nutzt in den geprüften Handyansichten 82–85 % des Chatbereichs (547–671 px). Kopfzeile und normale Eingabe sind zusammen etwa 116 px hoch; längere Eingaben und Anhänge bleiben begrenzt. Die unabhängige Designprüfung ist bestanden. Die Änderungen führen keine zusätzlichen Datenbankabfragen oder Polls ein. Temporäre Releaseprüfungen werden nach dem Abgleich der veröffentlichten Version entfernt.

## Weitere Videoanleitungen und feste Chatansicht

- [x] Sieben zusätzliche Abläufe aufnehmen: Kalenderauswahl/Teammonat, Besetzung/Bilder, Aufgaben, Maskenplan, Aufschriebe, Produktionszeit und private Chats.
- [x] Clips direkt bei den passenden Anleitungen und in Kurzvideos ergänzen; vorhandene Medien unverändert lassen.
- [x] Dateigrößen aus den fertigen Medien übernehmen, gemeinsame Speichergrenze prüfen und Rohaufnahmen entfernen.
- [x] Wiedergabe, Suchbarkeit und Zuordnung gezielt prüfen und das Releasepaket für GitHub/Vercel vorbereiten.
- [x] Chat auf eine feste, geräteabhängige Höhe begrenzen; Verlauf und Kanalliste intern scrollen und Eingabefeld sichtbar halten.
- [x] Kurze und lange Chatverläufe auf Handy und Desktop vergleichen; private Chat-Anleitung mit der neuen Ansicht aufnehmen.

Die elf aktiven Clips einschließlich Poster und Textspuren benötigen weniger als 4 MB. Die zusätzliche Sammlung wird statisch über Vercel ausgeliefert und erzeugt keine Neon-Abfragen. Der Chat bleibt unabhängig von der Nachrichtenanzahl gleich hoch.

## Ausgewählte Kurzvideos und Smartphone-Anleitung

- [x] iPhone-/iPad- und Android-Installation mit Mitteilungsfreigabe als erste Hilfeanleitung und FAQ ergänzen.
- [x] Kleine, gekennzeichnete Installationsclips sowie Mitteilungs- und Anwesenheitsclip einbinden.
- [x] Video erst nach Benutzeraktion laden; native Bedienung, kleine Poster, Textspuren und lesbare Schritte anbieten.
- [x] Statische Versionen über Vercel ausliefern, ohne Neon-Abfragen, Blob-Kopien oder Offline-Vorabdownload.
- [x] Handy-/Desktopdarstellung, Videogrößen, Dekodierung und tatsächliche Ladeanfragen gezielt prüfen; Rohmaterial und Testbilder entfernen.

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

- [x] Eigenes Verzeichnis „Ansprechpersonen“ für Kontakte ohne Benutzerkonto und ohne Schauspielerkatalog-Zuordnung.
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
- [x] Zeitkorrekturen werden direkt gespeichert; eine erneute Wochenfreigabe ist nicht erforderlich.
- [x] Beim Nachtragen das Enddatum zunächst am gewählten Starttag halten; ausdrücklich abweichende Enddaten erhalten.
- [x] Persönlicher Kalender beginnt mit der eigenen Person; leere Auswahl zeigt keine Einträge, „Alle anzeigen“ ist ausdrücklich auswählbar.
- [x] Teamansicht beginnt mit allen aktiven Teammitgliedern; danach die vorherige persönliche Auswahl wiederherstellen. Exporte übernehmen dieselbe Auswahl.
- [x] Teamliste getrennt von Fachdaten zwischenspeichern und gezielt bei Änderungen invalidieren.

## Gemeinsame Teamrechte

- [x] Freigegebene Teammitglieder können gemeinsame Produktionen, Kontakte, Schauspieler, Figuren, Besetzungen, Aufgaben, Sprints, Aufschriebe und Vorlagen verwalten.
- [x] Gemeinsame Rechte in Frontend und Backend; Produktionszugriff, private Entwürfe und persönliche Zeitbuchungen weiter schützen.
- [x] Eigene Kalenderplanung für Teammitglieder; Kalender anderer Personen und Gruppentermine ausschließlich für Admins.
- [x] Kategorien, Benutzerverwaltung und Freigaben für Freiwünsche bleiben Adminaufgaben.
- [x] Hilfe, FAQ, Einführung und Architektur beschreiben die neuen Rechte.

## Rückmeldungen von Lena und zusätzliche Teamkanäle

- [x] Kurze Beschreibungstexte unter Seitenüberschriften entfernen; Mitteilungen auf der Startseite nach oben ziehen.
- [x] Persönliche Vorstellungen der nächsten sieben Tage zählen und eigene Anwesenheitsstunden der aktuellen Woche als KPI anzeigen; kein Gesamtstunden-Switch.
- [x] Spielzeit-/Jahresfilter für Kalender, Teamboard und Zeitnachweise kompakter anzeigen; Kalender und Zeitnachweise mit aktueller Spielzeit öffnen.
- [x] Offline-Vormerken nur ohne Internet anbieten, gespeicherte Entwürfe weiterhin synchronisierbar halten.
- [x] Kommunikation in der mobilen Schnellnavigation und Kontaktverzeichnis als Ansprechpersonen benennen.
- [x] Verständliche deutsche Anmelde-/Registrierungsfehler und konsistente Regeln für Benutzernamen.
- [x] Admins können öffentliche Teamkanäle anlegen, umbenennen und archivieren; private Chats bleiben unverändert geschützt.
- [x] Hilfe/Einführung aktualisieren; Rechte, Spielzeitgrenzen, Exporte und Ansichten auf Desktop, Tablet und Smartphone prüfen.

## Kalender auf Smartphones

- [x] Teammonat und Teamwoche mobil als vertrautes Raster mit sieben Wochentagen statt breiter Personenspalte.
- [x] Tagesauswahl zeigt vollständige Namen, Zeiten, Kategorien und Produktionsangaben; Gruppentermine einmal darstellen.
- [x] Kalenderfilter mobil zunächst einklappen und eigene/alle Kalender schnell auswählbar halten.
- [x] Persönlichen Monatskalender lesbarer machen und die gewählte Tagesliste bei Navigation passend halten.
- [x] Teammonat mit aktuellem Monat öffnen, auch wenn die laufende Woche im vorigen Monat beginnt.
- [x] Bestehende Kalenderrechte und Exportfilter erhalten; keine zusätzlichen Datenbankabfragen.
- [x] Mobile Kopfaktionen kompakt halten; auch volle Monate mit sechs Wochen auf kleinen Displays prüfen, einschließlich Dark Mode und unabhängiger Designbewertung.

## Chat-Kanalauswahl und Gerätemitteilungen

- [x] Desktop-Kanalauswahl einklappen und pro Benutzer auf dem Gerät merken; mobiler Kanalwechsler bleibt erhalten.
- [x] Ungelesene Nachrichten global, je Kanal/Chat und am eingeklappten Schalter mit Zählern anzeigen; beim sichtbaren Lesen gesammelt quittieren.
- [x] Push auf Geräten ausdrücklich aktivieren/deaktivieren, Testmitteilung und klare iPhone-/Systemhinweise in Einstellungen anbieten.
- [x] Ereignisgesteuerter Versand und App-Symbolzähler mit Rollen-/Privatheitsprüfung, sicheren Endpoints, Wiederholungen und Bereinigung abgelaufener Geräte.
- [x] Vercel-Schlüssel und Gerätemigration einrichten; Hilfe und Architektur aktualisieren.

## Weitere Produktionsänderungen

- [x] Ensemble-Import für Admins aus der Schauspielerübersicht des Stadttheaters Ingolstadt; eindeutige vorhandene Schauspieler aktualisieren, zusätzliche Einträge erhalten und Bilder übernehmen.
- [x] Figuren- und Besetzungs-KPIs in Produktionsübersichten anhand „Abschiedsdinner“ korrigieren; auch Freitext-Figuren und Alternativbesetzungen berücksichtigen.
- [x] Produktionsreiter „Figuren & Bilder“ entfernen; Besetzung als zentralen Bereich mit Bild-Uploads je Besetzung nutzen und bestehende Daten erhalten.
- [x] Produktionsübersicht standardmäßig mit aktueller Spielzeit öffnen; andere Spielzeiten auswählbar halten und beim Anlegen vorbelegen.

## QA-Nachbereitung

Nach den abschließenden Liveprüfungen werden die angelegten QA-Konten, Testeinträge und Testdateien aus der produktiven Umgebung entfernt. Automatische Testdefinitionen bleiben für spätere Änderungen erhalten.

## iPhone-Fotos und Maskenpläne

- [x] Große Mediathekfotos zuverlässig verkleinern, das tatsächliche Browser-Bildformat erkennen und bei Bedarf JPEG oder weitere Größenstufen verwenden. Transparente Bilder bleiben transparent.
- [x] Native Bilddekodierung als Alternative und HEIC/HEIF-Auswahl unterstützen; Dateien vor dem Upload in ein zulässiges Format umwandeln.
- [x] Je Produktion mehrere benannte Maskenpläne mit gemeinsam besetzten Personalspalten und bearbeitbaren Zeitblöcken anlegen, duplizieren und löschen.
- [x] Abstände und Dauer vor Vorstellungsbeginn planen, mit fester Nullmarke, optionalen Uhrzeiten und Hinweisen auf Überschneidungen.
- [x] Schauspieler aus der Besetzung, mehrere Personen pro Block und individuelle freie Namen oder Tätigkeiten anbieten.
- [x] Smartphone-Zeittabelle mit fester Zeitspalte, seitlich verschiebbaren Personalspalten und zusätzlicher Listenansicht.
- [x] Änderungen gesammelt speichern; Entwürfe bei Versionskonflikten erhalten. Neue Ansichten oder Uhrzeiten lösen keine Datenbankabfragen aus.
- [x] Maskenpläne bei Wiederaufnahmen mitkopieren und PDF-/Excel-Zeittabellen sowie CSV-/JSON-Ausgaben bereitstellen.
- [x] Anleitungen und gezielte Bild-, Daten-, Export- und Bedienprüfungen ergänzen.

## Schnellzuweisung und Bedienung des Maskenplans

- [x] Aktive Personen im Produktionsteam mit einem Klick als Maskenbetreuung auswählen; mehrere Betreuungen und Entfernen bei erhaltener Teammitgliedschaft unterstützen.
- [x] Dieselbe Auswahl beim Anlegen und Bearbeiten einer Produktion anbieten, ohne zusätzliche Abrufe oder Änderungen vor dem Speichern.
- [x] Zahlenfelder für Vorlauf, Zeitblöcke, Buchungen, Bestände, Kategorien, Vorlagen und Jahresfilter vollständig leeren und ersetzen lassen; Zahlen erst beim Übernehmen validieren.
- [x] Neue Zeitblöcke direkt in eine Personalspalte auf die gewünschte Zeit ziehen, danach das vorbelegte Formular öffnen; alternativ ausdrücklich per Tipp platzieren.
- [x] Bestehende Zeitblöcke am Desktop ziehen und am Smartphone nach längerem Halten verschieben; kurzer Tipp bearbeitet weiterhin, normales Wischen scrollt.
- [x] Beim Verschieben Dauer und Inhalte erhalten, aufs Zeitraster runden und den Vorstellungsbeginn als Endgrenze beachten. Alle Änderungen bleiben bis Plan speichern lokal; Live-Konflikte erhalten den ursprünglichen Entwurf.
- [x] Hilfe und Modulbeschreibung an die neuen Abläufe anpassen.

## Aktuelle Spielzeit und historische Ensembles

- [x] Teamboard und zentralen Aufschriebsammelordner mit aktueller Spielzeit öffnen; allgemeine Aufgaben tatsächlich nach ihrer Spielzeit filtern.
- [x] Historische Produktionen im eigenen Zeitraum öffnen, einschließlich Aufgaben, Kalender und Produktionszeiten.
- [x] Schauspielerkatalog mit aktueller Spielzeit öffnen, frühere und alle Ensembles anzeigen und mehrere Spielzeiten je unverändertem Profil pflegen.
- [x] Bestehende Schauspieler der aktuellen Spielzeit und belegten historischen Besetzungen zuordnen, nach Sicherung und Abgleich der Daten und Verknüpfungen.
- [x] Theaterimport mit eigener validierter Ziel-Spielzeit durchführen und frühere Zuordnungen sowie zusätzliche Schauspieler behalten.
- [x] Spielzeitfilter für Schauspielerexporte übernehmen und Hilfe sowie technische Dokumentation ergänzen.
