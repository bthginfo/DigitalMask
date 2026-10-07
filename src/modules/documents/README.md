# Gemeinsame Dokumente

Word-DOCX, Excel-XLSX und CSV sind dieselben gemeinsam bearbeiteten Dateien für alle berechtigten Nutzer. Text wird als Yjs-XML-Fragment mit Tiptap bearbeitet; Tabellen verwenden Y.Map-Zellen. Gleichzeitige Textänderungen werden zeichenweise zusammengeführt, unabhängige Tabellenzellen bleiben erhalten. Bei gleichzeitigem Schreiben in dieselbe Tabellenzelle bestimmt Yjs einen gemeinsamen Wert. PDF-Inhalte bleiben erhalten und bekommen gemeinsam bearbeitbare Notizen.

## Speicherung und Last

- Kleine Dateimetadaten bleiben in `records.files`. Dokumentinhalte liegen in der separaten Tabelle `collaborative_documents` und werden nicht mit der gesamten Workspace-Liste geladen.
- Originaldateien liegen weiterhin ausschließlich im privaten Vercel Blob Storage. Die Datei-ID bezeichnet den gemeinsamen bearbeitbaren Stand; Downloads über `/api/documents/:id/export` verwenden diesen Stand. `/api/files/:id` liefert die ursprüngliche Uploadversion.
- Lokale Änderungen werden höchstens alle drei Sekunden gebündelt übertragen. Redis-Lua versieht Updates atomar mit fortlaufenden Revisionen. Update-Antworten und Peer-Lesezugriffe liefern Änderungen seit der zuletzt gelesenen Revision, sodass eingebettete Bilder nicht bei jedem Tastendruck erneut übertragen werden.
- SSE über den vorhandenen Upstash-Broker enthält ausschließlich Revisionsnummern, keine Dokumentinhalte. Es gibt keine SQL-Abfrage pro Taste, pro SSE-Heartbeat oder für ungenutzte Dokumente.
- Redis-Updateprotokolle haben absichtlich **keine Ablaufzeit**. Basissnapshots entsprechen einem bereits committed SQL-Stand und können nach einem Cache-Ablauf aus SQL nachgeladen werden. Upstash-Eviction muss deaktiviert bleiben (Standard), damit ausstehende Updates bis zur Sicherung erhalten bleiben.
- SQL-Sicherungen erfolgen beim ausdrücklichen Speichern/Schließen, nach 60 Sekunden ohne Eingabe oder spätestens nach 15 Minuten laufender Bearbeitung. Die vorhandene tägliche Cron-Aufgabe sichert verbleibende Änderungen nach einem abrupten Browserabbruch.
- Ein SQL-Zeilenlock serialisiert Sicherungen. Redis entfernt erst nach dem SQL-Commit Updates bis zur gesicherten Revision. Neuere Updates und verspätete Bestätigungen können den Stand weder verlieren noch zurücksetzen.
- IndexedDB speichert den lokalen Yjs-Stand je Nutzer/Datei, erst nach erfolgreicher Autorisierung. Bei fehlender Verbindung bleiben Änderungen als unübertragen gekennzeichnet; erfolgreicher Server-Ack bestimmt die Anzeige „Gespeichert“.

## Zugriff

Ein Dokument erbt Leserechte vom übergeordneten Datensatz und dessen Produktion/privatem Chat. Berechtigte Chatteilnehmer dürfen Dateiinhalte gemeinsam bearbeiten, auch wenn jemand anderes die Nachricht hochgeladen hat; die Nachricht selbst und das Löschen der Datei folgen weiter den bestehenden Rechten. Archivierte Chats liefern nur Leserechte.

Cookie-gebundene, signierte Dokumenttickets erlauben nur eine Datei und laufen nach 30 Minuten ab. Ein Redis-Berechtigungsstand wird bei Workspace-Änderungen erneuert; jeder Inhaltszugriff und jedes Update prüft diesen Stand atomar. Nach einer Änderung müssen Clients ihre Session erneut über die Datenbank autorisieren. SSE-Tickets können deshalb auch bei einer später entzogenen Berechtigung keine Inhalte offenlegen.

## Formate und Grenzen

- Upload: 4.000.000 Bytes; DOCX/XLSX werden anhand ihres tatsächlichen ZIP-Inhalts geprüft. Makros, XML-Entitäten, ungültige Pfade und übergroße entpackte Archive werden abgelehnt. CSV benötigt UTF-8.
- Word: Überschriften, Textformatierung, Schriftfarben, Texthintergründe, Schriftfamilien und Größen, Listen, Links, eingebettete Bilder und einfache Tabellen. Ein begrenzter OOXML-Parser ergänzt die von Mammoth ausgelassenen Run-Formate, einschließlich vererbter Word-Stile und Designfarben. Die gemeinsamen TextStyle-Marks werden beim DOCX-/PDF-Export übernommen. Exporte erhalten nach Möglichkeit die originalen Kopf-/Fußzeilen, Seitenränder und übrigen Paketbestandteile. Komplexe Word-Layouts, Abschnittswechsel, Fußnoten und Spezialfunktionen werden nicht vollständig nachgebildet. Das Original bleibt abrufbar.
- Excel: bis zu 12 Blätter, 1.000 Zeilen, 100 Spalten und 50.000 gefüllte oder formatierte Zellen. Leere farbige Zellen bleiben sichtbar. Eine deduplizierte Stiltabelle speichert Füll-/Schriftfarben, Schriftformate, Ausrichtung und Rahmen; alle Zeilen-/Spaltenmaße verwenden CSS-Pixel. Formeln werden begrenzt ohne JavaScript-eval und ohne Netzfunktionen ausgewertet. XLSX-Export aktualisiert Zell-XML im Originalpaket und erhält übrige Styles/Diagramm-/Druckbestandteile. Excel berechnet Formeln beim Öffnen neu. Verbundene Zellen werden angezeigt und im Download erhalten; geändert wird die erste Zelle des Bereichs. Blockpaste in Verbindungen wird atomar abgelehnt.
- PDF: gemeinsames Notizfeld je ausgewählter Seite, Originalseiten bleiben erhalten, Download fügt Notizseiten an. Keine Bearbeitung bestehender PDF-Grafiken oder Texte.
- Gemeinsamer Importstand maximal 2 MB, aktueller Yjs-Stand maximal 3 MB, einzelnes gebündeltes Update 256.000 Bytes. Limits werden sichtbar gemeldet; Originaldownloads funktionieren weiterhin.
- Exporte: DOCX/PDF/TXT für Text, XLSX/CSV/PDF für Tabellen (CSV je ausgewähltem Blatt), PDF mit Notizen. Tabellen-PDFs teilen breite Tabellen in beschriftete Spaltenabschnitte und wiederholen Kopfzeilen für lesbare Ausdrucke.

Die Feldnamen `body`, `sheets`, `dimensions` und `notes` gehören zum gespeicherten Yjs-Format; Änderungen daran benötigen eine Migration. Server-Import, Client-Editor und Export verwenden dieselbe Textschema-Definition.

### Formeln in hochgeladenen Excel-Dateien

Formeln werden als vollständige Ausdrücke im gemeinsamen Zellstand erhalten. Relative, absolute und blattübergreifende Referenzen sowie Formeln aus geteilten Excel-Bereichen bleiben erhalten. Änderungen an einer geteilten Formel lösen beim Download ausschließlich die betroffene Gruppe in vollständige Einzelformeln auf; unveränderte geteilte Formeln behalten ihre ursprünglichen XML-Attribute. Die Übersetzung deutscher Funktionsnamen und Trennzeichen verändert weder Zeichenketten noch zitierte Blattnamen oder strukturierte Tabellenverweise.

Gängige Formeln werden im Browser neu berechnet. Bei besonderen Funktionen steht „Excel berechnet“; die Ausgangsformel bleibt bearbeitbar und wird als Formel heruntergeladen. Array-/Spill-Ergebnisse neuer Importe sind als berechnete Ergebnisse geschützt, statt sie als unabhängige Eingaben zu behandeln. Die Ausgangsformel kann bearbeitet werden. XLSX-Downloads behalten unveränderte Array-Attribute, dynamische Metadaten und übrige Originalbestandteile. Nicht berechenbare Ergebnisse und davon abhängige Formelcaches werden nach Änderungen entfernt, damit Excel sie beim Öffnen mit den aktuellen Eingaben neu berechnet. Das ist keine vollständige Excel-Berechnungsengine; Makros und spezielle Excel-Funktionen werden nicht im Browser ausgeführt. Die Ergänzung verwendet kompakte Formelinformationen und den bestehenden Dokumentstand, ohne Datenbankabfrage pro Eingabe.

`metadata.formattingVersion` steuert eine einmalige, bedarfsweise Ergänzung älterer Dokumente beim Öffnen. Excel ergänzt nur Präsentationsmetadaten; aktuelle Zellwerte und gewachsene Dimensionen bleiben erhalten. Frühere Werte in Merge-Slaves lösen ausschließlich die betroffenen Verbindungen, auch beim Export. Word ergänzt fehlende Marks nur in eindeutig identischen Absätzen, ohne Text oder gesetzte Nutzerfarben zu ersetzen. Das Delta geht durch das bestehende Redis-Protokoll und wird mit ausstehenden Änderungen unter demselben SQL-Zeilenlock gesichert. Danach sind keine weiteren Originalimporte oder zusätzlichen SQL-Zugriffe für Formatierung nötig.
