# DigitalMask

Arbeitsraum für die Maske am Stadttheater Ingolstadt: Produktionen, Dienstplanung, Aufgaben, Zeitbuchungen und gemeinsame Dokumentation. Deutsche Oberfläche, Europe/Berlin, Wochenbeginn Montag, Light/Dark/System-Modus und Smartphone-Navigation.

## Funktionen

- Benutzername/Passwort, Selbstregistrierung mit Adminfreigabe, Teammitglied/Admin/Superadmin, persönliche Passwortänderung und einmalige Wiederherstellungscodes.
- Persönlich gespeicherte Pastell-Akzentfarben, geführte Einführung mit Wiederholung, Hilfe mit FAQ/Anleitungen und private Feature-/Fehlerberichte mit Superadmin-Bearbeitung.
- Produktionsarbeitsräume mit Maskenteam, prominenter Maskenbetreuung, frei definierbaren Kontaktrollen (z. B. Regie, Kostüm, Assistenz), Archiv und Kopie für Wiederaufnahmen. Wiederverwendbare externe Kontakte mit E-Mail, Telefon und Notizen im Verzeichnis „Weitere Personen“ benötigen kein Konto; Maskenkontakte können aus dem Team gewählt oder frei eingetragen werden.
- Figuren, Besetzungen mit mehreren privaten Bildern, Aufschriebe, Aufgaben, Sprints, Kalender, Zeiten und Chat direkt in der jeweiligen Produktion. Schauspieler und Figuren lassen sich beim Besetzen anlegen oder als freie Namen eintragen. Der Schauspielerkatalog bleibt gemeinsam verfügbar.
- Eigenes Kanban je Produktion und separates Teamboard für allgemeine Aufgaben ohne Produktionsbezug. Sprints mit individuellen Zeiträumen, Zuweisungen, Unteraufgaben und Checklisten; Verschieben auch ohne Drag-and-drop.
- Persönliche und überlagerte Kalender: Monat, Woche, Tag, Agenda und Teamraster für Woche und Monat. Adminplanung, verwaltbare Kategorien, ganztägige Abwesenheiten, Serien, Konflikterkennung, Freiwunschanträge und widerrufbare ICS-Abonnements. Optionale Titel verwenden sonst den Produktions- oder Kategorienamen.
- Anwesenheit im Theater und Arbeitszeit auf Produktionen getrennt erfassen, mit unabhängigen pausierbaren Timern, manuellen Nachträgen und Korrekturen. Allgemeine Tätigkeiten ohne Produktion, Mitternachtsaufteilung, Tages-/Wochensummen, Projektstunden und Wochenfreigabe mit Korrekturworkflow.
- Projektchats, allgemeiner Maskenkanal und private Direkt-/Gruppenchats mit geschützten Anhängen und Teilnehmerrechten.
- Aufschriebe nach Schauspielern mit allgemeiner Stückdauer, Bildern und Versionsverlauf. Wiederholbare Textfelder für Vorbereitung, Makeup, Haare, Perücken und Bärte, Umbau & Wechsel sowie Einrichten; eigene Kategorien und Vorlagen. Zentrale Übersicht mit allgemeinen und produktionsbezogenen Dokumenten einschließlich Archiv und Spielzeit-/Jahresfiltern. Historische Dokumente bleiben lesbar.
- Material-/Perückenfundus, verwaltbare Kategorien, Lagerorte, Mindestbestände, Einkaufsbedarf und QR-Links; allgemeine Dienstübergaben mit einzelnen Checklistenpunkten und wiederholbaren Hinweisen unter „Worauf muss ich achten“.
- Suche, Benachrichtigungen, CSV-Importvorlagen, PDF/XLSX/CSV/JSON-Exporte und ICS-Kalenderexporte.
- Installierbare PWA und ausdrücklich gespeicherte lokale Zeitentwürfe. Private API-Antworten und Bilder werden nicht im Service Worker gespeichert.

## Architektur

Next.js App Router, React, TypeScript strict, Tailwind CSS mit eigenen gemeinsamen UI-Komponenten, FullCalendar Standard und dnd-kit. Servermodule verwenden Better Auth, Zod, Drizzle und PostgreSQL; Dateien liegen im privaten Vercel Blob Store. Der PDF-/Tabellenrenderer verarbeitet autorisierte Eingabedaten und führt keine Datenbankabfragen aus.

`src/app/api` enthält HTTP-Eingangspunkte, `src/modules` Fachregeln und Exporte, `src/platform` Authentifizierung, Scope, Datenbank und Outbox; `src/components/modules` die jeweiligen Benutzeroberflächen. Die Plattform ist ein modularer Monolith. Eine zusätzliche Organisation/Gewerk-Zuordnung ist im Schema vorgesehen; die aktuelle Oberfläche arbeitet mit dem zugeordneten Gewerk Maske.

Das aktuelle Fachdatenmodell verwendet einen typisierten Record-Speicher: Organisations-/Gewerksscope, Art, Person, Produktion, Elternbezug, Zeitraum, Version und Zeitstempel sind relationale, indizierte Spalten. Fachliche Nutzdaten werden je Art durch Zod validiert und als JSONB gespeichert. Identitäten, Mitgliedschaften, Timer, Aufschriebversionen, Kalenderzugänge, Audit und Outbox haben eigene Tabellen. Das erleichtert neue Module; häufige komplexe Auswertungen können später dedizierte Tabellen oder Materialized Views erhalten. Projektbeziehungen werden serverseitig geprüft, Organisationsgrenzen zusätzlich durch zusammengesetzte Fremdschlüssel.

## Lokal starten

Node.js 24, npm und PostgreSQL-Verbindungsdaten benötigt:

```sh
npm ci
# .env.example nach .env.local kopieren und ausfüllen
npm run db:migrate
npm run bootstrap
npm run dev
```

`bootstrap` erstellt einmalig die Organisation, das Gewerk und einen Superadmin. Vorhandene Superadmins werden nicht überschrieben. Generierte Zugangsdaten stehen ausschließlich in `.local/ADMIN-ZUGANG.txt`, das von Git ausgeschlossen ist. Registrierungen erhalten keine Adminrechte; der Superadmin kann diese im Bereich Einstellungen vergeben.

Prüfungen:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Integrationstests benötigen eine laufende Anwendung sowie den lokalen Bootstrap-Zugang. Sie legen klar benannte QA-Datensätze an und entfernen Fachdaten wieder. Der vollständige PDF-Rasterlauf ist optional: `EXPORT_RENDER_QA=1 npm test` (PowerShell: `$env:EXPORT_RENDER_QA='1'; npm test`). Die gerenderten Fixtures in `artifacts/exports` enthalten ausschließlich synthetische Daten.

Die UI-Prüfungen für Passwortfelder und Produktionsnavigation verwenden Dummywerte bzw. einen simulierten Workspace. Die Passworttests prüfen Chromium und WebKit auf Desktop und in mobiler Touchansicht; dafür ist kein echtes Konto erforderlich. WebKit-Prüfungen ersetzen keinen Test auf einem konkreten Safari-Gerät.

## Datenbankverbrauch

- Kein regelmäßiger Workspace-, Timer-, Kalender- oder Benachrichtigungs-Poll. Timeranzeige, Suche, Filter, Serientermine und Summen werden lokal aus dem geladenen Datenbestand berechnet.
- Profileinstellungen werden in der vorhandenen Mitgliedschaftsabfrage mitgeladen. Eine persönliche Farbänderung invalidiert nur den eigenen Profilcache; Tour-Schritte erzeugen keine Schreibzugriffe.
- Anwesenheits- und Arbeitszeittimer werden gemeinsam in einer indizierten UNION-Abfrage geladen. Bildreferenzen werden beim Speichern gebündelt statt einzeln je Bild geprüft. Private Nachrichten verwenden Teilnehmerrechte auch für Anhänge, Benachrichtigungen und Exporte.
- Produktionsbereiche, Kontaktverzeichnis, Spielzeit-/Jahresfilter und Teamboard verwenden denselben geladenen Workspace. Kontaktpersonen und Bilder werden beim Speichern gebündelt validiert; externe Kontakte erzeugen keine Authentifizierungskonten. Kategorien werden einmalig durch Migration bzw. beim Anlegen eines neuen Gewerks bereitgestellt, ohne erneutes Anlegen gelöschter Kategorien beim Lesen.
- Datenbestand und Team werden gemeinsam pro Gewerk für 300 Sekunden serverseitig gecacht; danach erfolgt bedarfsabhängige Erneuerung. Änderungen invalidieren den betroffenen Scope. Timerzustand ist ebenfalls gecacht.
- Lesende Sitzungs- und Mitgliedschaftsprüfungen sind für 60 Sekunden gecacht. Schreibzugriffe prüfen die Sitzung und aktuellen Rechte unmittelbar in der Datenbank. Entzugene Zugänge können dadurch höchstens innerhalb des kurzen Lese-Cachefensters noch bereits erlaubte Inhalte sehen, aber nichts mehr verändern.
- Chatabfragen erfolgen alle 30 Sekunden ausschließlich im sichtbaren, fokussierten Chat, mit Änderungscursor und exponentiellem Backoff bei Fehlern. Ergebnisse werden 30 Sekunden geteilt gecacht.
- Nach fachlichen Writes werden nur tatsächlich angelegte Ereignisse verarbeitet. Ein CSV-Import bündelt Cacheinvalidierung und Ereignisverarbeitung. Der tägliche Cron dient ausschließlich der Wiederaufnahme liegengebliebener Aufträge.
- PostgreSQL-Pool maximal drei Verbindungen je Funktionsinstanz, kurze Idle-Zeit, keine minutenlangen Netzwerktransaktionen. Zeitbuchungen und Wochenfreigaben verwenden gezielte Sperren und partielle Eindeutigkeitsindizes.

Der gemeinsame Workspace lädt derzeit den Gewerkbestand einmal pro Cacheerneuerung. Für sehr große Bestände ist eine Aufteilung in zeitlich begrenzte Read-Modelle und zusätzliche Pagination vorgesehen; die aktuelle Architektur vermeidet fortlaufende Abfragen, garantiert aber keinen bestimmten Neon-Tarifverbrauch. Externe ICS-Kalenderapps bestimmen ihr eigenes Abrufintervall; jeder Abruf prüft die Widerrufbarkeit des Zugangs.

## Betrieb und Exporte

Infrastruktur und Freigabeprozess: [docs/BETRIEB.md](docs/BETRIEB.md). Ursprüngliche Architekturplanung und aktueller Umsetzungsstand: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md). Details zu Drucklayouts und Formaten: [src/modules/exports/README.md](src/modules/exports/README.md).

Ein JSON-Export enthält Fachdaten, aber keine Binärdateien oder Authentifizierungstabellen. Er ersetzt kein Datenbank-/Blob-Backup. Vercel- und GitHub-Verwaltungstokens gehören ausschließlich in lokale Zugangswerkzeuge, niemals in Anwendungsvariablen oder das Repository.
