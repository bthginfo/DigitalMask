# Google Kalender

DigitalMask überträgt ausgewählte Termine einseitig in einen vorhandenen Google-Kalender, dessen Eigentümer die verbundene Person ist. Änderungen werden nach dem Speichern über die bestehende Outbox verarbeitet. Es gibt keinen regelmäßigen Datenbank-Poll für diese Funktion.

## Einrichtung

Die optionale Integration benötigt serverseitig:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_ENCRYPTION_KEY`: 32 zufällige Bytes als 64 Hexzeichen. Den Schlüssel dauerhaft aufbewahren; ein Austausch ohne Umschlüsselung macht bestehende Verbindungen unlesbar.
- `APP_URL`: die feste öffentliche HTTPS-Adresse der Installation.

Die Google Calendar API muss aktiviert sein. Der OAuth-Webclient verwendet ausschließlich `${APP_URL}/api/integrations/google-calendar/callback` als Weiterleitungsadresse und die Bereiche `openid`, `email`, `calendar.calendarlist.readonly` und `calendar.events.owned`. Jeder Nutzer gibt seinen eigenen Zugriff bei Google frei. Produktionsmodus verhindert die siebentägige Lebensdauer von Erneuerungstoken einer externen Test-App; Google kann weiterhin eine Verifizierung verlangen oder eine Warnung und Nutzergrenze anwenden.

Vor dem Deployment Migration `0015_google_calendar_sync` anwenden. Fehlende Umgebungsvariablen deaktivieren die Integration, ohne die übrige App einzuschränken. Die öffentliche Seite `/google-calendar` erläutert die Datennutzung und muss bei Google hinterlegt sein.

## Verwendung

Unter **Einstellungen → Google Kalender** oder direkt im Kalender verbinden, Zielkalender auswählen und den Abgleich aktivieren. Möglich sind die eigenen Termine, ausgewählte Personen oder das gesamte Team sowie Filter auf Produktion und Kalenderart. Diese Auswahl ist unabhängig vom gerade angezeigten Monat und der Spielzeit. In einer installierten Smartphone-App bei Problemen die Einrichtung im normalen Browser öffnen und dort zuerst bei DigitalMask anmelden.

DigitalMask bleibt die Quelle. Änderungen an den Kopien in Google werden nicht zurückübertragen. Die Verbindung verarbeitet keine fremden Google-Termine, erstellt keine Einladungen und aktiviert keine Erinnerungen. Ganztägige Termine, Wiederholungen und Ausnahmen bleiben erhalten; der Kalender verwendet die Zeitzone Europe/Berlin.

## Betrieb und Fehlerbehandlung

OAuth-Token sind mit AES-256-GCM und einem getrennten Schlüssel verschlüsselt; die Verschlüsselung bindet Nutzer, Abteilung und Verbindung ein. OAuth verwendet kurzlebigen Zustand, eine HttpOnly-Cookie und PKCE. Keine Token, Autorisierungscodes oder vollständigen Google-Antworten protokollieren.

Abgleiche verwenden eine zeitlich begrenzte Verbindungssperre, gespeicherte Google-IDs, private Herkunftsmarkierungen und ETags. Fingerprints überspringen unveränderte Termine; pro Abgleich werden Abteilungsdaten gemeinsam geladen und Änderungen gebündelt gespeichert. Große Erstimporte werden in begrenzten Fortsetzungen abgearbeitet. Doppelte Zustellung und unklare Netzwerkantworten erzeugen keine weiteren Kopien derselben zugeordneten Buchung.

Temporäre Fehler bleiben in der Outbox mit wachsender Wartezeit. Ein späterer Verarbeitungslauf durch eine App-Aktion, manuellen Abgleich oder den bestehenden täglichen Wartungslauf versucht sie erneut. Es gibt deshalb keine garantierte maximale Synchronisationslatenz bei Google-Ausfällen oder Kontingentüberschreitungen. Widerrufene Rechte verlangen eine erneute Google-Verbindung; die eigentlichen DigitalMask-Termine bleiben gespeichert.

Bei geänderter Auswahl oder geändertem Ziel werden nur zugeordnete DigitalMask-Kopien entfernt oder angepasst. **Verbindung trennen** widerruft die Google-Token und löscht die lokale Verbindung samt Zuordnungen. Bereits übertragene Google-Termine bleiben ausdrücklich erhalten. Werden sie vor einer neuen Verbindung nicht in Google entfernt, können diese alten, nun unabhängigen Kopien neben den neu übertragenen Terminen stehen.
