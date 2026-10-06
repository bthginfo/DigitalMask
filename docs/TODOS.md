# Umsetzungsstand

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
- [x] Geänderte Produktionszeiten öffnen betroffene eingereichte/freigegebene Wochen automatisch zur erneuten Prüfung; Konflikte mit veralteten Freigaben abfangen.
- [x] Beim Nachtragen das Enddatum zunächst am gewählten Starttag halten; ausdrücklich abweichende Enddaten erhalten.
- [x] Persönlicher Kalender beginnt mit der eigenen Person; leere Auswahl zeigt keine Einträge, „Alle anzeigen“ ist ausdrücklich auswählbar.
- [x] Teamansicht beginnt mit allen aktiven Teammitgliedern; danach die vorherige persönliche Auswahl wiederherstellen. Exporte übernehmen dieselbe Auswahl.
- [x] Teamliste getrennt von Fachdaten zwischenspeichern und gezielt bei Änderungen invalidieren.

## Gemeinsame Teamrechte

- [x] Freigegebene Teammitglieder können gemeinsame Produktionen, Kontakte, Schauspieler, Figuren, Besetzungen, Aufgaben, Sprints, Aufschriebe und Vorlagen verwalten.
- [x] Gemeinsame Rechte in Frontend und Backend; Produktionszugriff, private Entwürfe und persönliche Zeitbuchungen weiter schützen.
- [x] Eigene Kalenderplanung für Teammitglieder; Kalender anderer Personen und Gruppentermine ausschließlich für Admins.
- [x] Kategorien, Benutzerverwaltung und Freigaben für Freiwünsche und Wochen bleiben Adminaufgaben.
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
