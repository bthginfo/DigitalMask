# Abnahme der Erstinstallation

Stand: 30. September 2026. Liveadresse: https://digitalmask.vercel.app. Repository: https://github.com/bthginfo/DigitalMask, Produktionsbranch `codex/digitalmask`.

## Durchgeführte Prüfungen

| Prüfung                                                         | Ergebnis                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| TypeScript strict                                               | bestanden                                                                     |
| ESLint                                                          | bestanden                                                                     |
| Prettier                                                        | bestanden                                                                     |
| Produktionsbuild lokal und Vercel                               | bestanden                                                                     |
| Unit-/Exporttests                                               | 29 bestanden; optionaler Rastertest im Standardlauf übersprungen              |
| Vollständiger PDF-Rasterlauf                                    | separat durchgeführt: 48 Seiten gerendert, ausgewählte Seiten visuell geprüft |
| Reale Datenbank- und Rechteabläufe                              | lokal und auf der Liveadresse bestanden                                       |
| Private Blob-Uploads, PDF mit Bildern und Wiederaufnahme-Kopien | lokal und live bestanden                                                      |
| Design-/Bedienprüfung Desktop, Tablet, Smartphone, beide Themes | nach einer Überarbeitungsrunde bestanden                                      |
| Dependency-Audit einschließlich Entwicklung                     | keine gemeldeten Schwachstellen beim Prüflauf                                 |
| GitHub Actions                                                  | erfolgreich                                                                   |

Die Live-Integration prüft Registrierung ohne automatische Freischaltung, Adminaktivierung, Rollenverbote, Aufgabenstatus und Versionskonflikte, Zeitbuchung und Idempotenz, Überlappungen, Projektstundensumme, CSV, Wochenfreigabe inklusive Sperre einer nachträglichen Datumsverschiebung, Wiederöffnung zur Korrektur, Freiwunschentscheidung und widerrufbare Kalenderabonnements. Der Dateilauf prüft anonymen Zugriff, tatsächliche WebP-Dateien im privaten Store, Dokumentversionen, PDF-Erzeugung und Bilder nach Löschen der ursprünglichen Referenz einer Wiederaufnahme.

Kalenderregeln testen zusätzlich Nachtzeiten über die Sommerzeitumstellung, Ausnahmen, inklusive Serienenddaten und alte Serien im aktuellen Sichtfenster. Exportfixtures verwenden lange Inhalte, mehrere Personen/Produktionen, Bilder, Seitenumbrüche und Monats-/Wochen-/Tages-/Teamansichten. Die Fixtures enthalten keine echten Theaterdaten.

## Iteration: Produktionsarbeitsräume und Passwortfelder

Produktionskontakte unterstützen freie Rollen, externe Namen ohne Konto und Maskenpersonen aus dem aktiven Team oder per freier Namenseingabe. Zugeordnete Maskenpersonen werden in der vorhandenen gebündelten Rechteprüfung validiert und in das Produktionsteam aufgenommen. Zusätzliche Teammitglieder können weiterhin zugeordnet werden. Diese JSONB-Erweiterung benötigt keine zusätzliche Tabelle oder Migration.

Die erweiterten realen Integrationen prüfen inaktive Kontaktzuordnungen, automatische Produktionsmitgliedschaft, Kontakterhalt bei Teamänderungen und getrennte Produktions-/Teamboard-Exporte. Zwei Besetzungsbilder bleiben bei Bearbeitung erhalten; private Abrufe, PDFs und Wiederaufnahme-Kopien sind geprüft. Die Galerie liegt sowohl bei Figuren als auch bei Besetzungen im Produktionsbereich.

Der zusätzliche Exportlauf enthält 16 synthetische PDF-Seiten mit langen Kontaktrollen/-namen, mehreren privaten Galerieabbildungen und einem getrennten Teamboard. Seitenzähler, Seitenränder, vollständige Inhalte und Bilder sind automatisiert geprüft; ausgewählte Seiten wurden zusätzlich visuell kontrolliert.

Die Passwortsteuerung wird gemeinsam auf Anmeldung, Registrierung, Wiederherstellung und in den Einstellungen verwendet. 16 Browserfälle prüfen Chromium und WebKit auf Desktop und in mobiler Touchansicht: Ein-/Ausblenden, Tastatur, Berührungsflächen und Erhalt getippter bzw. per DOM-Autofill eingesetzter Werte. Eine separate Bedienprüfung ist bestanden. Der ursprüngliche Fehler wurde auf dem konkreten Safari-Gerät der Nutzerin nicht reproduziert; WebKit-Tests sind keine Prüfung dieses Geräts oder von iCloud-Schlüsselbund-Autofill.

## Infrastruktur und Zugriff

Vercel bestätigt `READY`, die öffentliche Projektadresse und Funktionsregion Frankfurt (`fra1`). Die dedizierte Neon-Datenbank wurde migriert; der private Blob Store ist verbunden. GitHub- und Vercel-Verwaltungstokens sind weder in Git noch im korrigierten Deployment-Quellpaket enthalten. Das initiale Adminpasswort wurde vor Übergabe erneuert und die alte Anmeldung ausdrücklich geprüft und abgewiesen.

Die CLI hatte bei der ersten Veröffentlichung eine von Git ausgeschlossene lokale Zugangskopie hochgeladen. `.vercelignore` verhindert das nun explizit; das betroffene Deployment wurde nach der korrigierten Veröffentlichung gelöscht. Das korrigierte Quellpaket wurde auf tatsächliche Dateien unter `.local`, `.env.local`, `artifacts` und `test-results` geprüft: keine enthalten. Die Superadmin-Zugangsdaten stehen ausschließlich lokal in `.local/ADMIN-ZUGANG.txt`.

QA-Produktionen, Bildreferenzen und inaktive synthetische Testkonten wurden nach der Prüfung entfernt. Es wurden keine personenbezogenen Daten aus den Kalender-/Stundenzettelfotos in die Anwendung oder das öffentliche Repository übernommen.

## Fachliche und betriebliche Grenzen

Die unleserlichen Excel-Farblegenden und Kürzel wurden nicht erfunden. Die implementierten Kategorien können auf Basis einer lesbaren Vorlage weiter angepasst werden. Es gibt keine automatische tarifliche Sollstunden-/Überstundenbewertung; die Software weist tatsächliche Buchungsdauer und Summen aus.

In-App-Benachrichtigungen sind umgesetzt. Push/E-Mail-Kanäle, eine technische Outbox-Konsole, Gewerkwechsel in der Oberfläche und eine externe Zwei-Wege-Kalendersynchronisation bleiben Erweiterungspunkte. PDF-/Datenausgabe und widerrufbare ICS-Abonnements funktionieren bereits.

Produktive Backup-/Restore- und Budgeteinstellungen beim Datenbankanbieter benötigen eine zum Theaterbetrieb passende Betriebsentscheidung. Die vorhandenen Exporte ersetzen keine vollständige Datenbank-/Blob-Sicherung; Details stehen in BETRIEB.md. Die lokale Entwicklung teilt bei dieser Erstinstallation noch die dedizierte Datenbank; vor weiterer Entwicklung mit echten Theaterdaten sollte sie getrennt werden.

## Erweiterung Profil und Fachmodule

Das persönliche Design nutzt sechs gespeicherte Akzentpaletten und bestehende Light-/Dark-Modi. Die Einführung startet beim ersten aktiven Login, lässt sich in der Hilfe wiederholen und schreibt den Abschluss einmalig. Hilfe/FAQ und private Feature-/Fehlerberichte mit Superadmin-Statuspflege sind integriert. Systemkonten sind aus Mitarbeiter-Auswahllisten ausgeschlossen, bestehende Zuordnungen bleiben entfernbar.

38 Unit-/Exporttests sowie drei reale Backend-/Dateiabläufe sind bestanden. 20 synthetische Chromium-/WebKit-Szenarien prüfen Profil, Tour, Hilfe, Feedback, Mitarbeiter-Auswahl und Sessionablauf. Die unabhängige Designprüfung ist PASS.

Die nächsten Bedienmodule haben bereits geprüfte serverseitige Grundlagen: getrennte Anwesenheits- und Arbeitstimer, manuelle Korrekturen/Überschneidungsprüfung je Bereich, einmalig initialisierte Kalenderkategorien und private Direkt-/Gruppenchats. Teilnehmerrechte gelten auch für Dateien, Nachrichtenausgabe, Exporte und Benachrichtigungen; außerhalb eines Chats gibt es auch für Admin/Superadmin keine Einsicht. Die Tests prüfen entfernte Teilnehmer und verhindern das Verschieben privater Nachrichten/Anhänge in andere Chats. Neue Kalender-/Zeiterfassungs-/Chat-Oberflächen und die weiteren Produktions-/Dokumentationswünsche stehen in TODОS.md.

Anwesenheits-PDFs und XLSX erhalten eigene Tages-/Wochen-/Personensummen. Team-Monatskalender werden in lesbare Wochen- und Personengruppen aufgeteilt, mit vollständiger Agenda und dynamischer Kategorienlegende. Ganztägige Termine verwenden exklusive Datumsenden; Serien behalten lokale Uhrzeiten über Sommerzeitwechsel. Neue Rasterfixtures mit 29 Kalender- und 13 Anwesenheitsseiten wurden visuell auf vollständige Inhalte, Namen, Ränder und Seitenfuß geprüft.

## Zwischenpaket a481f99 und zusätzliche Fachprüfungen

- Profilfarben, erste Logovariante, Einführung und Hilfebereich wurden als a481f9948c4ef97e2b247e9a0538b68f7925f0a9 veröffentlicht. Vercel meldete READY; alle 46 Livefälle waren erfolgreich.
- Neue Backendprüfungen für wiederverwendbare Kontaktpersonen, freie Besetzungsnamen, strukturierte Aufschriebe, Kategorien und historische Jahres-/Spielzeitexporte sind bestanden. Drei bisherige Backend-/Datei-/Chat-Suiten wurden nach den Änderungen ebenfalls erfolgreich geprüft.
- Die neue PDF-Präsentation für Aufschriebe, allgemeine Dienstübergaben und Produktionskontakte erhielt eine unabhängige Designprüfung mit PASS. Die gezielte Nachprüfung sehr langer Namen und Spielzeitangaben ist ebenfalls PASS; Kopfzeilenabstände richten sich nach den tatsächlichen Schriftbreiten.
- Mehrfaches PDF-Rendering hatte zunächst einen Fontkit-Glyphcachefehler in der Unicode-Textzuordnung aufgedeckt. Die Schriftglyphen werden jetzt einmalig vor dem Subsetting initialisiert; dieselben Testassertions sowie eine parallele Exportprüfung sind erfolgreich. Aktueller vollständiger Stand: 56 Unit-/Exporttests bestanden, ein optionaler Rasterlauf übersprungen.
- Reale APItests protokollieren ausschließlich ihre Datensatz-IDs in einer ignorierten lokalen Datei, um QA-Audits/Outboxdaten präzise zu bereinigen. Private Testblobs werden nur bei bekanntem Testbezug und fehlender verbleibender Dateireferenz entfernt.
- Die Bedienoberflächen für getrennte Anwesenheit, Monats-Teamkalender und private Chats wurden in jeweils 16 Chromium- und WebKit-Fällen geprüft. Die unabhängige Designprüfung ist PASS; sichtbare Einführung, vereinfachte Texte, neues Logo und Produktionssortierung sind enthalten.
- Migration 0008 ist angewendet: vorhandene externe Produktionskontakte sind mit dem Verzeichnis verknüpft, frühere Produktionsübergaben einschließlich Dateikontext werden allgemein geführt. Die Stückdauer eines Aufschriebs kann ausdrücklich auf die Produktionsdauer zurückgesetzt werden; Allgemeinordnerexporte schließen Produktionsdokumente aus. Die sechs gezielten Dokument-/Zeitraumprüfungen sind bestanden.

Auch die finale Dokumentationsoberfläche erhielt eine unabhängige Designprüfung mit PASS. Sie umfasst die zentralen Sammelordner, strukturierten Aufschriebe, allgemeinen Übergaben, Kontaktverzeichnis und produktionsbezogene Besetzung. Acht gezielte Chromium-/WebKit-Fälle prüfen Legacytexte, wiederholbare Felder, Vorlagen, erhaltene Bildzuordnungen, direkte Kontakt-/Figurenanlage, freie Besetzung, Kategorienverwaltung und Jahres-/Exportauswahl. Die abschließende TypeScript-Prüfung, Lint, Formatierung und der Produktionsbuild sind erfolgreich; die Bereitstellung nutzt die vorhandene GitHub-/Vercel-Anbindung.

## Live-Synchronisierung und Identitätsverknüpfung

Die neue Kommunikationsansicht wurde unabhängig bei 1440, 768 und 375 Pixeln in Light/Dark geprüft: PASS nach zwei gezielten Responsive-Korrekturen. Live-Updates verwenden Upstash Redis/SSE, signierte sitzungsgebundene Tickets und Ereignisbündelung. Es gibt kein regelmäßiges Workspace-/Chat-Polling. Team- und Timercaches haben separate Invalidierungstags.

21 gezielte Unit-/Exportprüfungen sind bestanden, einschließlich Ticketmanipulation, Ablauf, falschem Cookie/Gewerk, Reconnect-Cursor, Hintergrundpause, Namensinitialen, Mehrdeutigkeit und verlustfreier Kontaktkonsolidierung. Zwei reale Chromium-/WebKit-Abläufe prüfen Änderungen eines anderen Kontos, Offline-Replay, Chat-Neuzugang/Löschung und Accountfreigabe mit automatischer Initialen-Zuordnung. Eine gezielte Chromium-Nachprüfung bestätigt außerdem Kontaktwiederverwendung, Dublettenschutz und Timer-Cacheinvalidierung.

Die reale Konsolidierung hat vier Dublettengruppen von 30 auf 21 Kontaktpersonen reduziert. Alle 30 Produktionskontaktzuordnungen wurden innerhalb der Transaktion gegen den erwarteten Bestand geprüft; Sicherungen liegen ausschließlich lokal und werden nicht veröffentlicht. Rollen und Kontaktdetails bleiben erhalten. Bereits bestehende aktive Konten wurden ebenfalls geprüft; es gab keinen offenen eindeutigen Zuordnungsfall.

Die abschließende TypeScript-Prüfung, vollständiger ESLint-Lauf, Prettier-Prüfung und der Produktionsbuild sind bestanden. Die synthetischen Konten, Datensätze, Benachrichtigungen und Testdateien wurden nach den lokalen Liveprüfungen präzise anhand ihrer protokollierten IDs bereinigt.

## Zeitkorrekturen und Kalenderauswahl

Der Produktionsbuild, ESLint und 20 gezielte Unit-/Exportprüfungen sind bestanden. Zwei Browserabläufe gegen den lokalen Produktionsserver prüfen persönliche/leere/gesamte Kalenderauswahl einschließlich Exporten und Rückkehr aus der Teamansicht sowie Zeitkorrekturen für Mitglied, Admin und Superadmin. Desktop und Smartphone sind abgedeckt; ausdrücklich abweichende Enddaten bleiben erhalten, ansonsten folgt das Ende dem Starttag. Änderungen an Produktionszeiten öffnen betroffene Wochen erneut, unverändertes Speichern und Anwesenheitskorrekturen erhalten deren Freigabe. Veraltete Freigabeversionen werden abgewiesen, der ursprüngliche Besitzer einer Buchung bleibt erhalten.

## Gemeinsame Teamrechte

16 gezielte Berechtigungsprüfungen sowie ein realer Browser-/APIablauf mit einem normalen Teamkonto sind bestanden. Geprüft wurden Kontakt- und Produktionsanlage über die Oberfläche, automatische Erstellerzuordnung auch bei Maskenbetreuung, Schauspieler, Figuren, Besetzung, Sprints, Vorlagen, Bearbeitung fremd angelegter gemeinsamer Aufgaben und sichtbarer Aufschriebe sowie Wiederaufnahme. Nicht zugängliche Produktionen bleiben geschützt. Eigene Kalendertermine können Teammitglieder verwalten; fremde Termine, Gruppentermine, Kategorien und Freiwunschfreigaben bleiben geschützt. Ein Admin kann fremde Kalendertermine anlegen und ändern. Hilfe, FAQ und Einführung entsprechen diesen Rechten. Produktionsbuild, ESLint und Formatierung sind bestanden.

## Rückmeldungen von Lena und öffentliche Teamkanäle

43 gezielte Unitprüfungen sind bestanden: Teamkanalrechte und Privatheit, unveränderbare Chatart, aktuelle Spielzeit einschließlich Berliner Monatsgrenze, über Mitternacht aufgeteilte Zeitexporte, deutsche Anmeldefehler sowie vorhandene Kalender-/Zeitregeln. Browserprüfungen bei 1440, 768 und 375 Pixeln bestätigen Vorstellungen-KPI (auch über die fünf angezeigten Termine hinaus), höher platzierte Mitteilungen, aktuelle Spielzeit, mobile Kommunikation, Kontaktbezeichnung und Teamkanalanlage ohne Personenliste. Ein normaler Benutzer sieht öffentliche Kanäle ohne Verwaltungsaktionen. Die unabhängige Designprüfung ergab PASS.

APIprüfungen bestätigen verständliche Fehler für ungültige Benutzernamen, falsche Anmeldedaten, zu kurze Passwörter und bereits vergebene Benutzernamen. Alle Oberflächenprüfungen verwenden ausschließlich abgefangene API-Aufrufe mit synthetischen Fixtures. Es wurden keine Testkonten, Teamkanäle oder Nachrichten in der Datenbank angelegt. Produktionsbuild, ESLint und Formatierung sind bestanden.

Der Stunden-KPI zeigt nach der Korrektur ausschließlich eigene Anwesenheitsstunden der aktuellen Woche (Montag bis Sonntag), ohne Gesamtstunden-Switch. Zwei gezielte Browserprüfungen auf Desktop und Smartphone bestätigen die Trennung von Produktionsstunden, fremden Personen und früheren Wochen sowie die korrekte Aufteilung einer Buchung über die Wochengrenze. Build und ESLint sind bestanden.

## Kalender auf Smartphones

Sechs gezielte Chromium-Browserfälle decken 320, 375, 390, 768 und 1440 Pixel sowie persönliche Kalenderrechte ab. Monatsraster und Tagesdetails bleiben ohne seitlichen Seitenüberlauf nutzbar; auch ein belegter November mit sechs Kalenderwochen passt auf 812 Pixel hohen Smartphones oberhalb der Schnellnavigation. Gruppentermine zählen einmal, ganztägige Intervalle enden am korrekten Tag, Nachttermine erscheinen in beiden betroffenen Tagen und vollständige Namen bleiben zugänglich. Persönliche Auswahl wird nach der Teamansicht wiederhergestellt; Export und aktuelle Spielzeit entsprechen der Ansicht. Navigation und Tagesauswahl bleiben bei einem initialen Workspace-Aufruf, ohne zusätzliche Datenbankzugriffe.

22 gezielte Kalender-, Auswahl- und Berechtigungsprüfungen sind bestanden. Zwei zusätzliche WebKit-Browserfälle bestätigen die Smartphoneansicht, Exporte, eigene Kalenderrechte und Tagesdetails mit der Safari-Engine. Produktionsbuild mit TypeScript, gezieltes ESLint und Formatierung sind erfolgreich. Die unabhängige Designprüfung bei 320/375 Pixeln in Light und 390 Pixeln in Dark einschließlich eines belegten Sechs-Wochen-Monats ergab PASS. Die Oberflächenprüfungen verwenden ausschließlich synthetische, im Browser abgefangene API-Antworten; keine Testdaten wurden in der produktiven Datenbank angelegt.

## Chat-Kanalauswahl und Gerätemitteilungen

15 gezielte Unitprüfungen bestätigen bekannte sichere Push-Endpoints, Geräteschlüssel, private Payloads, aktuelle Chat-/Produktionsrechte, Badge-Zählung, abgelaufene Geräte, wiederholbare Providerfehler sowie den ServiceWorker mit Hintergrundempfang, sicherem Öffnen und Kontowechsel. Sechs Browserfälle bei 1440 und 390 Pixeln decken persistentes Einklappen, globale/kanalbezogene Zähler, gebündelte Lesequittungen, bewusste Aktivierung, Testversand, Deaktivierung, blockierte Erlaubnis und iPhone-Installationshinweise ab. Die unabhängige Designprüfung in Light/Dark ergab PASS.

Die Migration für Gerätesubscriptions und Vercel-VAPID-Konfiguration sind eingerichtet. Tests verwenden synthetische API-Antworten und simulierte Geräte; sie versenden keine Mitteilungen an reale Kolleginnen und legen keine produktiven QA-Daten an. Der tatsächliche Empfang auf einem Handy setzt die Installation bzw. Browserunterstützung und ausdrücklich erteilte Systemerlaubnis voraus.

Drei gezielte WebKit-Nachprüfungen bestätigen Desktop-/Smartphone-Kanalzähler, die Lesequittung nur bei sichtbarem Verlaufsende und Aktivierung/Deaktivierung auf dem Smartphone. Der finale Produktionsbuild mit TypeScript, ESLint und Formatierung ist bestanden.
