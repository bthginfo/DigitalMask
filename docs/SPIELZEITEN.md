# Spielzeiten und Ensemble

Die aktuelle Spielzeit läuft vom 1. August bis zum 31. Juli. Die Berechnung verwendet Europe/Berlin und berücksichtigt damit auch den Wechsel um Mitternacht. Gleichwertige Angaben wie `2026/27`, `2026 / 2027` und `2026–2027` werden als dieselbe Spielzeit behandelt.

Globale Übersichten für Produktionen, Kalender, Zeitnachweise, Teamboard, Aufschriebe und Schauspieler beginnen mit der aktuellen Spielzeit. Frühere und alle Spielzeiten bleiben ausdrücklich auswählbar. Ein direkt geöffnetes historisches Stück verwendet für seine Aufgaben, seinen Kalender und seine Produktionszeiten die eigene Spielzeit. Allgemeine Aufschriebe, Kontakte, Bestände und Vorlagen bleiben als gemeinsame Referenzen verfügbar.

## Aufgaben

Allgemeine Teamaufgaben speichern ihre Zuordnung in `data.season`. Neue Aufgaben übernehmen die gewählte Spielzeit; bei Alle Spielzeiten ist die aktuelle Spielzeit vorbelegt. Unteraufgaben übernehmen die Zuordnung der Hauptaufgabe. Produktionsaufgaben werden weiterhin über die Spielzeit ihres Stücks gefiltert.

Ältere allgemeine Aufgaben ohne gespeicherte Zuordnung verwenden zunächst die Spielzeit ihres gültigen Fälligkeitsdatums, sonst ihres Anlagedatums. Beim nächsten Speichern wird diese Zuordnung festgehalten. Eine bestehende Aufgabe wandert dadurch beim Jahreswechsel nicht automatisch in eine andere Spielzeit.

## Schauspieler

Ein Schauspieler behält genau ein Profil und eine stabile ID. `data.ensembleSeasons` enthält die zugehörigen Spielzeiten als normalisierte Liste, zum Beispiel `['2025/2026', '2026/2027']`. Beim Bearbeiten können freigegebene Teammitglieder einzelne Spielzeiten ergänzen oder entfernen. Eine leere Liste bedeutet ausdrücklich keine Zuordnung; Alle Spielzeiten zeigt den Eintrag weiterhin. Besetzungen, Aufschriebe, Maße, Hinweise und Porträts bleiben am selben Profil.

Migration `0011_ensemble_seasons` ergänzt nur bisher fehlende Zuordnungen. Die vorhandenen Profile gehören zunächst zur aktuellen Spielzeit. Weitere historische Zuordnungen werden ausschließlich aus gespeicherten, verknüpften Besetzungen mit gültiger Produktionsspielzeit übernommen. Eine vorhandene Liste wird nicht ersetzt. Vor der Übernahme wurde der reale Datenbestand gesichert und danach auf unveränderte IDs, Maskenangaben, Bilder, Besetzungen und Produktionen geprüft. Die Sicherung liegt ausschließlich lokal im ignorierten `.local`-Verzeichnis.

## Theaterimport und Export

Die offizielle Website liefert die derzeitige Liste von Schauspiel, Gästen und Jungem Theater. Sie ist keine historische Ensemblequelle. Der Import besitzt deshalb eine eigene Ziel-Spielzeit, die immer aktuell startet. Die Vorschau hält diese Zuordnung für sämtliche Importbatches fest; `GET /api/ensemble?season=...` und `POST /api/ensemble` mit `season` validieren sie auch serverseitig.

Ein Import ergänzt die Ziel-Spielzeit am vorhandenen Profil. Er entfernt weder frühere Mitgliedschaften noch manuell ergänzte Personen. Namens- und Quellenzuordnung bleiben spielzeitübergreifend; es wird keine neue Identität pro Spielzeit erzeugt. Ein unveränderter Wiederholungsimport schreibt keine identischen Daten erneut.

Die Exportauswahl verwendet denselben Zeitraumfilter wie die Übersicht. Schauspielerexporte enthalten zusätzlich die gespeicherten Spielzeiten. Die historischen Besetzungsreferenzen bleiben davon unberührt.

## Datenbankzugriffe

Zeitraumwechsel filtern den bereits geladenen Workspace im Browser. Es entstehen keine neuen Abfragen je Auswahl. Das bestehende Workspace-Caching und die Live-Invalidierung bleiben bestehen; der Cache-Namenswechsel bei diesem Release stellt einmalig die migrierten Mitgliedschaften bereit.
