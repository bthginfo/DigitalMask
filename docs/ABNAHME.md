# Abnahme der Erstinstallation

Stand: 30. September 2026. Liveadresse: https://digitalmask.vercel.app. Repository: https://github.com/bthginfo/DigitalMask, Produktionsbranch `codex/digitalmask`.

## Durchgeführte Prüfungen

| Prüfung                                                         | Ergebnis                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| TypeScript strict                                               | bestanden                                                                     |
| ESLint                                                          | bestanden                                                                     |
| Prettier                                                        | bestanden                                                                     |
| Produktionsbuild lokal und Vercel                               | bestanden                                                                     |
| Unit-/Exporttests                                               | 19 bestanden; optionaler Rastertest im Standardlauf übersprungen              |
| Vollständiger PDF-Rasterlauf                                    | separat durchgeführt: 48 Seiten gerendert, ausgewählte Seiten visuell geprüft |
| Reale Datenbank- und Rechteabläufe                              | lokal und auf der Liveadresse bestanden                                       |
| Private Blob-Uploads, PDF mit Bildern und Wiederaufnahme-Kopien | lokal und live bestanden                                                      |
| Design-/Bedienprüfung Desktop, Tablet, Smartphone, beide Themes | nach einer Überarbeitungsrunde bestanden                                      |
| Dependency-Audit einschließlich Entwicklung                     | keine gemeldeten Schwachstellen beim Prüflauf                                 |
| GitHub Actions                                                  | erfolgreich                                                                   |

Die Live-Integration prüft Registrierung ohne automatische Freischaltung, Adminaktivierung, Rollenverbote, Aufgabenstatus und Versionskonflikte, Zeitbuchung und Idempotenz, Überlappungen, Projektstundensumme, CSV, Wochenfreigabe inklusive Sperre einer nachträglichen Datumsverschiebung, Wiederöffnung zur Korrektur, Freiwunschentscheidung und widerrufbare Kalenderabonnements. Der Dateilauf prüft anonymen Zugriff, tatsächliche WebP-Dateien im privaten Store, Dokumentversionen, PDF-Erzeugung und Bilder nach Löschen der ursprünglichen Referenz einer Wiederaufnahme.

Kalenderregeln testen zusätzlich Nachtzeiten über die Sommerzeitumstellung, Ausnahmen, inklusive Serienenddaten und alte Serien im aktuellen Sichtfenster. Exportfixtures verwenden lange Inhalte, mehrere Personen/Produktionen, Bilder, Seitenumbrüche und Monats-/Wochen-/Tages-/Teamansichten. Die Fixtures enthalten keine echten Theaterdaten.

## Infrastruktur und Zugriff

Vercel bestätigt `READY`, die öffentliche Projektadresse und Funktionsregion Frankfurt (`fra1`). Die dedizierte Neon-Datenbank wurde migriert; der private Blob Store ist verbunden. GitHub- und Vercel-Verwaltungstokens sind weder in Git noch im korrigierten Deployment-Quellpaket enthalten. Das initiale Adminpasswort wurde vor Übergabe erneuert und die alte Anmeldung ausdrücklich geprüft und abgewiesen.

Die CLI hatte bei der ersten Veröffentlichung eine von Git ausgeschlossene lokale Zugangskopie hochgeladen. `.vercelignore` verhindert das nun explizit; das betroffene Deployment wurde nach der korrigierten Veröffentlichung gelöscht. Das korrigierte Quellpaket wurde auf tatsächliche Dateien unter `.local`, `.env.local`, `artifacts` und `test-results` geprüft: keine enthalten. Die Superadmin-Zugangsdaten stehen ausschließlich lokal in `.local/ADMIN-ZUGANG.txt`.

QA-Produktionen, Bildreferenzen und inaktive synthetische Testkonten wurden nach der Prüfung entfernt. Es wurden keine personenbezogenen Daten aus den Kalender-/Stundenzettelfotos in die Anwendung oder das öffentliche Repository übernommen.

## Fachliche und betriebliche Grenzen

Die unleserlichen Excel-Farblegenden und Kürzel wurden nicht erfunden. Die implementierten Kategorien können auf Basis einer lesbaren Vorlage weiter angepasst werden. Es gibt keine automatische tarifliche Sollstunden-/Überstundenbewertung; die Software weist tatsächliche Buchungsdauer und Summen aus.

In-App-Benachrichtigungen sind umgesetzt. Push/E-Mail-Kanäle, eine technische Outbox-Konsole, Gewerkwechsel in der Oberfläche und eine externe Zwei-Wege-Kalendersynchronisation bleiben Erweiterungspunkte. PDF-/Datenausgabe und widerrufbare ICS-Abonnements funktionieren bereits.

Produktive Backup-/Restore- und Budgeteinstellungen beim Datenbankanbieter benötigen eine zum Theaterbetrieb passende Betriebsentscheidung. Die vorhandenen Exporte ersetzen keine vollständige Datenbank-/Blob-Sicherung; Details stehen in BETRIEB.md. Die lokale Entwicklung teilt bei dieser Erstinstallation noch die dedizierte Datenbank; vor weiterer Entwicklung mit echten Theaterdaten sollte sie getrennt werden.
