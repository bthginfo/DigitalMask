# Betrieb von DigitalMask

## Einrichtung

Das Vercel-Projekt heißt `digitalmask`, Organisation `juliusvingelheim-2692s-projects`, Node 24. Funktionen laufen in Frankfurt (`fra1`). Eine dedizierte Neon-Datenbank und ein privater Vercel Blob Store sind über Vercel provisioniert und mit Production und Development verbunden. Ein vorhandenes Vercel-Pro-Konto wird verwendet; kein Tarifupgrade wurde vorgenommen.

Das Repository ist `bthginfo/DigitalMask`, Implementierungsbranch `codex/digitalmask`. Nach der initialen Veröffentlichung dient dieser Branch auch als Vercel-Produktionsbranch. Der GitHub-PAT wird nur für den initialen Push verwendet. Deployments können danach über die vorhandene Vercel-GitHub-Verbindung erfolgen.

Production benötigt `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL` und `CRON_SECRET`. Blob-Zugriff nutzt die verknüpfte Store-ID und Vercel OIDC; lokale Entwicklung kann den zugewiesenen Blob-Token verwenden. Verwaltungs-PATs gehören nicht zu den Runtime-Variablen. `.env.local`, `.local` und `.vercel` sind vollständig von Git ausgeschlossen.

Lokale Einrichtung verwendet derzeit dieselbe dedizierte Datenbank wie die Erstinstallation. Für weitere Entwicklung mit realen Theaterdaten ist eine separate Development-Datenbank erforderlich. Preview wird absichtlich nicht mit der Produktionsdatenbank verbunden. Der Vercel-Ignore-Befehl überspringt Preview-Builds bis zur isolierten Einrichtung. Vor aktiven Vorschauen müssen ein isolierter Neon-Branch, eigene Auth-Secrets und eine getrennte Blob-Zuordnung eingerichtet und der Ignore-Befehl angepasst werden.

## Releases

1. `npm ci`, Typprüfung, Lint, Tests und Build durchführen.
2. Neue Migrationen überprüfen und kontrolliert mit `npm run db:migrate` gegen das gewünschte Ziel anwenden. Additive Änderungen bevorzugen, damit ältere Deployments während eines Rollbacks weiterlaufen.
3. Commit pushen und Produktionsdeployment prüfen. Bei manueller Veröffentlichung die Vercel-CLI mit `--prod` verwenden. Tokens werden nicht als Git-Remote gespeichert.
4. Login, Workspace, private Bilder und mindestens einen PDF-Export auf der Liveadresse prüfen.

CI führt keine Produktionsmigrationen durch. Der einmalige Bootstrap wird ebenfalls nicht bei jedem Deployment ausgeführt.

## Rechte und Wiederherstellung

Registrierungen warten auf Freigabe. Im Bereich Einstellungen können Admins Teammitglieder freischalten/deaktivieren; Rollenänderungen bleiben Superadmins vorbehalten. Schreibzugriffe prüfen aktuelle Rechte. Der initiale Superadmin-Zugang liegt nur in der lokalen Datei `.local/ADMIN-ZUGANG.txt`; das Passwort nach der ersten Anmeldung ändern.

Ohne E-Mail-Anmeldung erfolgt Wiederherstellung über einen einmaligen 15-Minuten-Code. Admin gibt den Code persönlich weiter; der Nutzer setzt das Passwort auf der Anmeldeseite. Bestehende Sitzungen werden widerrufen. ICS-Abonnements enthalten einen geheimen Kalenderzugang; im Profil lässt er sich widerrufen und ersetzen.

## Ereignisse und Logs

Aufgabenzuweisung, Dienständerung, veröffentlichter Aufschrieb und Freiwunschentscheidung erzeugen In-App-Benachrichtigungen. Datei-Löschungen werden ebenfalls über die transaktionale Outbox abgewickelt. Aufschriebmeldungen sind auf berechtigte Projektmitglieder und Admins begrenzt.

Nach relevanten Writes läuft der Worker in `after`; der tägliche Cron um 03:17 UTC übernimmt ausgefallene bzw. fällige Jobs. Der Cron-Endpunkt benötigt `Authorization: Bearer CRON_SECRET`. Jeder Lauf übernimmt höchstens 20 Ereignisse mit Lease und `SKIP LOCKED`; weitere Batches werden bei folgenden Writes oder Recoveryläufen verarbeitet. Sechs fehlgeschlagene Versuche führen zu `failed`. Diese Aufträge sind in der Outbox sichtbar; Wiederanstoßen erfolgt derzeit kontrolliert im Datenbankwerkzeug, nach Behebung der Ursache. Eine technische Admin-Konsole ist ein Erweiterungspunkt.

Vercel-Logs enthalten bei API-Fehlern Fehlerklasse und Datenbankfehlercode. Passwörter, Sessioncookies, SQL-Parameter und Blob-Tokens werden nicht geloggt. Die fachlichen Auditzeilen speichern Aktion, betroffene ID, Person und Zeitpunkt. Die Oberfläche bietet Versionsverläufe für Aufschriebe und Vorlagen; Audit dient zunächst der serverseitigen Nachvollziehbarkeit.

## Backups und Kosten

Die Live-Verbindung verwendet die zusätzliche Ressource `digitalmask-live` (Upstash Redis, Frankfurt/fra1, Free-Plan). Vercel injiziert `KV_REST_API_URL` und `KV_REST_API_TOKEN`; alternativ sind `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` möglich. Tokens bleiben ausschließlich serverseitig. SSE-Reconnects lesen keine PostgreSQL-Daten. Ein einstündiges signiertes Ticket bindet den Gewerkkanal an den Login-Cookie; Live-Nachrichten enthalten ausschließlich eine zufällige Revisionskennung. Tatsächliche Daten werden über den bestehenden autorisierten Workspace abgerufen. Hintergrundtabs pausieren und Ereignisbursts werden gebündelt. Bei Brokerstörungen bleiben Schreibvorgänge erfolgreich; eine unterbrochene Verbindung bietet erneuten Verbindungsaufbau. Neue Inhaltsansichten oder verlorene lange Verbindungslücken können eine einmalige Datenaktualisierung auslösen.

Der bestätigte Upstash-Free-Plan enthält 500.000 Commands monatlich. Am 1. Oktober 2026 wurde das gemeinsam genutzte Neon-Marketplace-Abonnement auf ausdrücklichen Wunsch des Kontoinhabers auf `free_v3` (Free) aktualisiert. Vercel und Neon bestätigen denselben Tarif; alle 15 zugehörigen Datenbanken einschließlich `digitalmask-postgres` wurden anschließend einzeln als Free und verfügbar geprüft. Der Tarif enthält 0,5 GB Speicher und 100 CU-Stunden pro Projekt sowie bis zu 100 Projekte. Bereits entstandene Launch-Nutzungskosten bleiben davon unberührt. Der Vercel-Tarif ist davon unabhängig.

Für die einmalige Kontaktkonsolidierung dient `npx tsx scripts/merge-people.ts` als Vorschau und `--apply` als Ausführung. Die Ausführung sichert den betroffenen Gewerkbestand vorher unter `.local`, bewahrt alternative Angaben in Notizen, ersetzt Referenzen und prüft innerhalb einer Transaktion alle Produktionskontakte. Vor Freigabe neuer Accounts verknüpft die Adminaktion eindeutige freie Maskenkontakte mit dem Konto; unklare Namensinitialen werden nicht automatisch zugeordnet.

Das Neon-Wiederherstellungsfenster und Kostenalarme hängen vom Marketplace-Tarif ab. Vor Übernahme produktiver Personendaten im Anbieter-Dashboard passende Wiederherstellung und Budgetbenachrichtigungen einrichten und einen Restore in eine isolierte Datenbank prüfen. Der JSON-Export ist für fachliche Weiterverarbeitung vorgesehen und ersetzt weder PostgreSQL-Backup noch private Blob-Sicherung.

Private Bilder brauchen ein separates Sicherungsziel mit gleicher Zugriffsregelung. Beim Kopieren einer Produktion werden Bildreferenzen geteilt; eine Datei wird erst physisch gelöscht, wenn kein Record mehr auf denselben Blobpfad verweist. Medien werden auf maximal 1800 Pixel und WebP komprimiert, Standortmetadaten entfernt. Die Einzeluploadgrenze beträgt 4 MB; PDF-Bildexporte sind auf 80 Bilder je Abruf begrenzt.

Zur Begrenzung von Neon-CPU nutzt die Anwendung bedarfsabhängige Caches und keinen dauerhaften Datenbankprozess. Neon kann dadurch im Leerlauf schlafen. Fachliche Änderungen, stündliche Ticket-Erneuerungen bei aktivem Browser oder regelmäßige externe Kalenderabrufe können die Datenbank dennoch aufwecken. Live-Heartbeats und die fünfminütigen SSE-Reconnects verwenden Redis und signierte Tickets. Realen Verbrauch nach Start im Neon-/Vercel-Dashboard prüfen; es wird kein fixer kostenloser Dauerbetrieb versprochen.

Admins starten den Ensemble-Import im Schauspielerkatalog über „Ensemble laden“ und prüfen vor dem Übernehmen die Vorschau. Die Haus-Ensemble-Liste der verlinkten Theaterseite ist die Quelle; Gäste werden nicht zusätzlich importiert. Mehrdeutige doppelte Katalogeinträge zuerst fachlich prüfen. Fehlgeschlagene Profile oder Bilder erscheinen im Ergebnis mit Namen und können durch erneuten Import ergänzt werden. Die letzte erfolgreiche Information bleibt bei nicht erreichbaren Profilen erhalten; eigene Hinweise, Maße und Fotos sowie Produktionsverknüpfungen bleiben bestehen. Imports laufen ausschließlich auf Anforderung, ohne Neon-Abfragen im Hintergrund.
