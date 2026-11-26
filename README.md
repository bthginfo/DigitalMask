# DigitalMask

Arbeitsraum für die Maske am Stadttheater Ingolstadt: Produktionen, Dienstplanung, Aufgaben, Zeitbuchungen und gemeinsame Dokumentation. Deutsche Oberfläche, Europe/Berlin, Wochenbeginn Montag, Light/Dark/System-Modus und Smartphone-Navigation.

## Funktionen

- Benutzername/Passwort, Selbstregistrierung mit Adminfreigabe, Teammitglied/Admin/Superadmin, persönliche Passwortänderung und einmalige Wiederherstellungscodes.
- Persönlich gespeicherte Pastell-Akzentfarben, geführte Einführung mit Wiederholung, Hilfe mit FAQ/Anleitungen und private Feature-/Fehlerberichte mit Superadmin-Bearbeitung.
- Produktionsarbeitsräume mit Maskenteam, prominenter Maskenbetreuung, frei definierbaren Kontaktrollen (z. B. Regie, Kostüm, Assistenz), Archiv und Kopie für Wiederaufnahmen. Wiederverwendbare externe Kontakte mit E-Mail, Telefon und Notizen im Verzeichnis „Ansprechpersonen“ benötigen kein Konto; Maskenkontakte können aus dem Team gewählt oder frei eingetragen werden.
- Figuren, Besetzungen mit mehreren privaten Bildern, Aufschriebe, Aufgaben, Sprints, Kalender, Zeiten und Chat direkt in der jeweiligen Produktion. Schauspieler und Figuren lassen sich beim Besetzen anlegen oder als freie Namen eintragen. Der Schauspielerkatalog bleibt gemeinsam verfügbar.
- Eigenes Kanban je Produktion und separates Teamboard für allgemeine Aufgaben ohne Produktionsbezug. Sprints mit individuellen Zeiträumen, Zuweisungen, Unteraufgaben und Checklisten; Verschieben auch ohne Drag-and-drop.
- Persönliche und überlagerte Kalender: Monat, Woche, Tag, Agenda und Teamraster für Woche und Monat. Adminplanung, verwaltbare Kategorien, ganztägige Abwesenheiten, Serien, Konflikterkennung, Freiwunschanträge und widerrufbare ICS-Abonnements. Optionale Titel verwenden sonst den Produktions- oder Kategorienamen.
- Anwesenheit im Theater und Arbeitszeit auf Produktionen getrennt erfassen, mit unabhängigen pausierbaren Timern, manuellen Nachträgen und Korrekturen. Allgemeine Tätigkeiten ohne Produktion, Mitternachtsaufteilung, Tages-/Wochensummen und Projektstunden; Buchungen werden direkt gespeichert und bleiben ohne Wochenfreigabe bearbeitbar.
- Projektchats, allgemeiner Maskenkanal, von Admins verwaltete Teamkanäle für das ganze Gewerk und private Direkt-/Gruppenchats mit geschützten Anhängen und Teilnehmerrechten. Neue aktive Teammitglieder sehen Teamkanäle automatisch.
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
# .env.example nach .env.development.local kopieren und mit einer separaten Entwicklungsdatenbank ausfüllen
# DEVELOPMENT_DATABASE_URL und DATABASE_URL müssen auf diese Entwicklungsdatenbank zeigen
npm run db:migrate:dev
npm run bootstrap:dev
npm run dev
```

`bootstrap:dev` erstellt die lokale Organisation und einen Entwicklungs-Superadmin. Die Zugangsdaten stehen in `.local/ADMIN-ZUGANG-DEV.txt`. Produktivmigrationen und die erstmalige Produktiveinrichtung bleiben ausdrücklich `db:migrate` und `bootstrap`; deren Zugangsdaten stehen getrennt in `.local/ADMIN-ZUGANG.txt`. Alle Zugangsdateien sind von Git ausgeschlossen. `next dev` verweigert den Start ohne explizite `DEVELOPMENT_DATABASE_URL` (alternativ `DEV_DATABASE_URL`), damit `.env.local` nicht versehentlich die Produktivdatenbank aktiviert.

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
- Fachdaten werden pro Gewerk für 300 Sekunden serverseitig gecacht und bei Änderungen invalidiert. Das Team ist unabhängig für eine Stunde gecacht und wird bei Registrierung/Freigabe/Rollenänderung erneuert. Persönliche Timer haben einen eigenen Cachetag; Starten, Pausieren, Fortsetzen und Verwerfen erneuern nur diesen Cache und senden kein Live-Signal. Eine Nachricht oder Aufgabenänderung löst keine neue Timerabfrage je Teammitglied aus.
- Next.js speichert Data-Cache-Einträge über 2 MB nicht. Wachsende Bereiche (Kalender, Arbeit/Zeiten, Aufschriebe, Dateien) liegen deshalb je Kalenderjahr ihres Anlagezeitpunkts in eigenen Einträgen; das zusammengesetzte Ergebnis ist identisch. Nachrichten lädt SQL nur bis zu 300 je Chat (Konversation, Produktionschat, allgemeiner Kanal); die Mediengalerie lädt ihren einen Chat vollständig. Ein Eintrag über 1,5 MB erzeugt einmalig eine Log-Warnung mit Schlüssel und Größe. Ein Lesevorgang, der vor einer Änderung beginnt und erst nach deren Invalidierung speichert, kann den alten Stand höchstens bis zum Ablauf der 300 Sekunden halten; eine Revision im Cacheschlüssel würde pro Abruf eine zusätzliche Redis- oder Datenbankabfrage kosten.
- Lesende Sitzungs- und Mitgliedschaftsprüfungen sind für 60 Sekunden gecacht. Schreibzugriffe prüfen die Sitzung und aktuellen Rechte unmittelbar in der Datenbank. Entzugene Zugänge können dadurch höchstens innerhalb des kurzen Lese-Cachefensters noch bereits erlaubte Inhalte sehen, aber nichts mehr verändern.
- Änderungen anderer Personen und Chatnachrichten kommen über eine gemeinsame SSE-Verbindung mit Upstash Redis an. Signale enthalten nur die betroffenen Bereichsnamen, eine Revision und – bei Änderungen aus dem Browser – die zufällige Tab-Kennung aus dem Header `x-dm-client` (`origin`), damit der schreibende Tab sein eigenes Echo ignorieren kann. Anschließend werden ausschließlich diese autorisierten Bereiche nachgeladen; Änderungen an Produktions-/Chatberechtigungen oder Dateien ersetzen sicherheitshalber den vollständigen sichtbaren Bestand. Löschungen melden Dateien nur, wenn tatsächlich Anhänge entfernt wurden; Registrierungen und Wochenstunden melden nur Teamdaten. Wiederholte, bereits gespeicherte Sendungen erzeugen kein Signal. Dokument-Zugangstickets werden nur bei Produktions-, Chat-, Datei- und Mitgliedschaftsänderungen erneuert. Ereignisse werden gebündelt, inaktive Tabs pausiert und Verbindungsabbrüche mit Änderungscursor nachgeholt. Es gibt keinen regelmäßigen Chat- oder Workspace-Poll.
- Die fünfminütigen Live-Reconnects prüfen ein an die Sitzung gebundenes, signiertes Ticket ohne Neon-Abfrage. Das Ticket gilt eine Stunde; nur bei Ablauf oder fachlichen Änderungen wird erneut autorisiert geladen.
- Bei der Adminfreigabe eines neuen Teamkontos werden passende freie Maskenkontakte und ihre Produktionszuordnungen verknüpft. Eindeutige Nachnameninitialen und Umlautschreibweisen werden erkannt; mehrdeutige Namen bleiben unverknüpft. Kontaktangaben bleiben gespeichert, verknüpfte Personen erscheinen als Teammitglieder.
- Nach fachlichen Writes werden nur tatsächlich angelegte Ereignisse verarbeitet. Ein CSV-Import bündelt Cacheinvalidierung und Ereignisverarbeitung. Der tägliche Cron nimmt liegengebliebene Aufträge wieder auf und löscht in Stapeln von 5.000 Zeilen: gelesene Mitteilungen nach 30 Tagen, ungelesene nach 180 Tagen, erledigte Outbox-Aufträge nach 14 und fehlgeschlagene nach 90 Tagen, Audit nach einem Jahr sowie abgelaufene Sitzungen, Verifizierungen und Drosselungszähler.
- Ungelesene Chatnachrichten werden über Lesemarken je Person und Chat (`chat_reads`) gezählt, nicht über eine Mitteilung je Nachricht und Empfänger. Eine indizierte Abfrage zählt Nachrichten anderer nach der Lesemarke; das Ergebnis (`chatUnread`) liegt wie die Mitteilungen außerhalb der gemeinsamen Snapshots. Ohne Lesemarke gilt die neueste gelesene frühere Chatmitteilung dieses Chats, sonst der Einführungszeitpunkt bzw. die spätere Kontoerstellung. Lesen erneuert nur die eigenen Caches und sendet kein Signal an das Gewerk. Push für Chatnachrichten bleibt erhalten.
- Kalenderkonflikte prüfen nur die Termine der betroffenen Personen um die geprüften Tage sowie laufende Serien; Löschprüfungen durchsuchen nur Arten, die auf den gelöschten Eintrag verweisen können; Überschneidungen von Buchungen haben eine untere Zeitgrenze. Viele gleichzeitig geplante Dienste ergeben innerhalb von zehn Minuten eine zusammengefasste Mitteilung und höchstens einen Push je Person.
- PostgreSQL-Pool maximal drei Verbindungen je Funktionsinstanz, kurze Idle-Zeit, keine minutenlangen Netzwerktransaktionen. Zeitbuchungen verwenden gezielte Sperren und partielle Eindeutigkeitsindizes.

Der Workspace verwendet getrennte, bis zu 300 Sekunden gültige Fachbereich-Caches mit gezielter sofortiger Invalidierung nach Änderungen; persönliche Mitteilungen, Timer und das Team sind bis zu einer Stunde gecacht. Benachrichtigungen liegen außerhalb der gemeinsamen Snapshots: SQL lädt ausschließlich die eigenen ungelesenen Einträge; Gelesenes bleibt gespeichert, wird aber nicht wiederholt übertragen. Eine Benachrichtigungsänderung invalidiert nur die betroffenen Personen. Kalenderabonnements und Chat-Historie laden nur ihre benötigten Bereiche. Entwicklung verwendet ein eigenes Neon-Projekt und dessen eigenes Kontingent. Für sehr große historische Bestände bleibt zusätzliche Pagination sinnvoll; ein bestimmter Free-Tarifverbrauch wird nicht garantiert. Externe ICS-Kalenderapps bestimmen ihr eigenes Abrufintervall; jeder Abruf prüft die Widerrufbarkeit des Zugangs.

## Betrieb und Exporte

Infrastruktur und Freigabeprozess: [docs/BETRIEB.md](docs/BETRIEB.md). Ursprüngliche Architekturplanung und aktueller Umsetzungsstand: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md). Details zu Drucklayouts und Formaten: [src/modules/exports/README.md](src/modules/exports/README.md).

Ein JSON-Export enthält Fachdaten, aber keine Binärdateien oder Authentifizierungstabellen. Er ersetzt kein Datenbank-/Blob-Backup. Vercel- und GitHub-Verwaltungstokens gehören ausschließlich in lokale Zugangswerkzeuge, niemals in Anwendungsvariablen oder das Repository.
