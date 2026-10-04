# Kurze Videoanleitungen

Die Hilfe enthält ausgewählte, lautlose Clips für die Smartphone-Installation (iPhone/iPad und Android), das Einschalten von Mitteilungen und das Nachtragen der Anwesenheit. Die passenden Textanleitungen und FAQs bleiben unabhängig von der Wiedergabe verfügbar.

Handy- und Berechtigungsmenüs werden ausdrücklich als vereinfachte Ansicht gekennzeichnet. Die App-Aufnahmen verwenden ausschließlich fiktive Daten und einen lokal simulierten Push-Empfang. Sie senden keine echten Mitteilungen und legen keine produktiven Daten an.

## Laden und Speicher

- Kleine MP4-Dateien mit H.264, YUV420p und Faststart; keine Audiospur, kein externer Player und keine neuen Browserbibliotheken.
- Das Videoelement wird erst nach einem Klick angelegt. `preload="none"` verhindert den Vorabdownload; erst die Wiedergabe lädt das Video. Schließen, Bereichswechsel und Suchwechsel entfernen den Player.
- Poster sind kleine WebP-Dateien, die bei Sichtbarkeit geladen werden. WebVTT und lesbare Schritte ergänzen die eingeblendeten Erklärungen.
- `public/tutorials/v1` wird als statischer Inhalt über Vercel ausgeliefert. Es gibt keine Tutorial-API, Neon-Abfragen, Blob-Uploads oder serverseitige Fortschrittsspeicherung.
- Versionierte Assetpfade werden für ein Jahr im Browser/CDN gespeichert. Änderungen an veröffentlichten Dateien brauchen eine neue Version und einen passenden Eintrag in `next.config.ts`.
- Der Service Worker lädt nur das bestehende App-Symbol und die Offline-Seite vorab; Videos werden nicht in seinen Offline-Cache aufgenommen.
- Budget: höchstens 1,5 MB pro Clip, 30 kB pro Poster und 6 MB für die aktive Sammlung. Neue Themen nur bei einem häufigen oder erklärungsbedürftigen Ablauf ergänzen. Unbenutzte Assets entfernen; keine Rohaufnahmen veröffentlichen.

## Inhaltliche Grundlage

Die Installation wurde mit den offiziellen Anleitungen abgeglichen:

- [Apple: Website in Safari als App verwenden](https://support.apple.com/de-de/guide/iphone/iphea86e5236/ios)
- [Google Chrome: Web-App unter Android installieren](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=de)
- [Google Chrome: Mitteilungen unter Android](https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&hl=de)
- [WebKit: Push für Home-Bildschirm-Apps ab iOS/iPadOS 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

Bezeichnungen und Menüpositionen können je nach Betriebssystem, Browser und Handy abweichen. Die Installation ersetzt nicht die ausdrückliche Mitteilungsfreigabe pro Gerät.

## Erzeugung und Pflege

Die Generatoren sind Entwicklungswerkzeuge und werden nicht im Backend ausgeführt. Python benötigt Pillow und imageio-ffmpeg; die Browseraufnahme verwendet das bereits vorhandene Playwright. Die mitgelieferte Schriftkonfiguration verwendet Windows/Segoe UI. Anpassungen für andere Entwicklungsrechner bleiben auf die Generatoren beschränkt.

1. `python scripts/tutorials/generate-install.py` erstellt die schematischen Installationsclips, Poster und Textspuren.
2. Lokale App starten. `node scripts/tutorials/capture-push.mjs` zeichnet den echten Ablauf in den Einstellungen mit vollständig simuliertem Gerät auf. Die URL ist auf localhost beschränkt. Alle API-Netzwerkanfragen sind gesperrt; ausschließlich fiktive Antworten werden im Browser erzeugt.
3. `python scripts/tutorials/render-capture.py` ergänzt die Erklärtexte und erzeugt MP4, Poster und Textspur. Rohmaterial liegt ausschließlich unter `.local/tutorial-release`.
4. Der freigegebene Anwesenheitsclip wurde einmalig übernommen. Seine Textspur steht neben der MP4; eine erneute Aufnahme benötigt keine echten Zeitbuchungen.
5. Dateigrößen und Dauer in `src/modules/help/tutorials.ts` aktualisieren. Die tatsächliche Datei ist maßgeblich, nicht ein geschätzter Wert.
6. Alle Medien vollständig dekodieren, einzelne Schritte visuell prüfen und im Browser kontrollieren, dass vor dem Abspielen keine MP4 geladen wird. Anschließend Rohmaterial und Beispielaufnahmen löschen.

Geeignete spätere Themen: eigenen Kalender mit Kolleginnen einblenden; Maskenplan mit Zeitblöcken bearbeiten; Besetzung und Bilder pflegen. Dafür braucht es keine Clips für jede einfache Funktion.
