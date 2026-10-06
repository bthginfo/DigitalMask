export type HelpArticle = {
  id: string;
  title: string;
  module: string;
  intro: string;
  steps: string[];
  note?: string;
};
export const helpArticles: HelpArticle[] = [
  {
    id: "app-install",
    title: "App auf dem Smartphone installieren",
    module: "settings",
    intro:
      "Lege DigitalMask auf deinen Startbildschirm. Danach öffnest du sie über das App-Symbol und kannst Mitteilungen einschalten. Eine Installation aus dem App Store oder Play Store ist nicht nötig.",
    steps: [
      "iPhone oder iPad: Öffne digitalmask.vercel.app in Safari. Tippe auf Teilen. Je nach Safari-Ansicht findest du Teilen im Seitenmenü oder unter Mehr (…).",
      "iPhone oder iPad: Wähle Zum Home-Bildschirm beziehungsweise Zu Home-Bildschirm hinzufügen. Fehlt der Eintrag, scrolle in der Liste zu Aktionen bearbeiten und ergänze ihn dort.",
      "iPhone oder iPad: Lass Als Web-App öffnen eingeschaltet, falls diese Auswahl erscheint, und tippe auf Hinzufügen. Öffne DigitalMask danach über das neue Symbol. Für Mitteilungen brauchst du iOS oder iPadOS 16.4 oder neuer.",
      "Android: Öffne digitalmask.vercel.app in Chrome. Tippe auf App installieren, falls DigitalMask den Button anbietet, und bestätige die Installation.",
      "Android: Alternativ öffnest du das Dreipunkt-Menü von Chrome. Wähle Zum Startbildschirm hinzufügen beziehungsweise Zum Home-Bildschirm hinzufügen und dann Installieren. Die Bezeichnung kann je nach Chrome-Version abweichen. Öffne die App danach über ihr Symbol.",
      "Melde dich in der App an. Unter Mehr → Einstellungen → Mitteilungen auf diesem Gerät tippst du auf Mitteilungen aktivieren. Erlaube die Nachfrage deines Handys. Bei Nicht erlauben oder Blockieren bleibt der Empfang ausgeschaltet.",
      "Tippe auf Testmitteilung, um den Empfang zu prüfen. Wenn nichts ankommt, prüfe die Mitteilungen in den Handy-Einstellungen und den Fokus- beziehungsweise Nicht-stören-Modus. Die ausführliche Anleitung Mitteilungen auf dem Handy hilft dir weiter.",
    ],
    note: "Die Installation schaltet Mitteilungen noch nicht ein. Du entscheidest auf jedem Gerät einzeln. Die Kurzvideos zeigen die Handy-Menüs vereinfacht; Aussehen und Bezeichnungen können je nach Gerät abweichen.",
  },
  {
    id: "productions",
    title: "Produktionen, Team & Kontakte",
    module: "productions",
    intro:
      "Auf den Produktionskarten siehst du bereits die Maskenbetreuung. Standardmäßig stehen die nächsten Premieren zuerst; über Sortieren nach wechselst du zu Namen oder zuletzt geänderten Stücken.",
    steps: [
      "Die Übersicht startet mit der aktuellen Spielzeit von August bis Juli. Über Spielzeit kannst du ältere Stücke oder Alle Spielzeiten anzeigen. Neue Produktionen übernehmen die gewählte Spielzeit als Vorschlag; du kannst sie beim Anlegen ändern.",
      "Am Smartphone öffnest du Jahr und Spielzeit über Zeitraum auswählen. Die aktuelle Auswahl bleibt als kurze Zusammenfassung sichtbar. Zusätzliche Aktionen wie Import und Export findest du unter Mehr.",
      "Öffne Produktionen und wähle ein Stück. Alle freigegebenen Teammitglieder können Produktionen anlegen und zugängliche Produktionen bearbeiten, archivieren oder löschen. Wenn du ein Produktionsteam auswählst, bleibst du als Ersteller automatisch dabei.",
      "Im Stück wechselst du am Smartphone über Produktionsbereich zwischen Überblick, Besetzung, Maskenplan, Aufgaben und den übrigen Bereichen. Am Desktop bleiben die Reiter verfügbar.",
      "Unter Team & Kontakte lassen sich Rollen frei benennen, etwa Regie, Kostüm oder Maskenbetreuung. Wähle externe Kontakte aus Ansprechpersonen, damit ihre Kontaktdaten wiederverwendet werden.",
      "Fehlt eine Person, kannst du sie direkt im Kontaktformular anlegen oder ihren Namen frei eintragen. Beim Speichern der Produktion wird ein neuer freier Kontakt im Verzeichnis hinterlegt. Es entsteht kein Benutzerkonto.",
      "Für die Maskenbetreuung kannst du ein aktives Teammitglied, eine Person aus dem Verzeichnis oder einen freien Namen wählen. Nur ein ausgewähltes Teammitglied gehört dadurch automatisch zum Produktionsteam.",
      "Im Produktionsteam kannst du die Maskenbetreuung direkt bei einer Person auswählen. Mehrere Betreuungen sind möglich. Ein erneuter Klick entfernt nur diese Zuständigkeit; die Person bleibt im Team. Im Bearbeitungsformular gilt die Auswahl erst nach Speichern.",
      "Wenn eine bisher frei eingetragene Maskenperson einen Account erhält und ein Admin ihn freigibt, werden eindeutige Zuordnungen automatisch auf das Teamkonto umgestellt. Das klappt auch mit einem abgekürzten Nachnamen, etwa Julia G., wenn nur eine Person dazu passt.",
      "Weitere Teammitglieder lassen sich getrennt hinzufügen. Um eine Maskenbetreuung vollständig aus dem Team zu entfernen, zuerst ihre Betreuungsauswahl aufheben oder den Kontakt auf einen freien Namen umstellen, danach die Person aus dem Team nehmen.",
      "Unter Maskenplan plant ihr je Stück, wer vor der Vorstellung wann in die Maske kommt. Eine Produktion darf mehrere Pläne haben, etwa für AMA, Proben und Premiere.",
      "Bei einer Wiederaufnahme könnt ihr die Produktion kopieren. Prüft anschließend Termine, Aufgaben und fachliche Angaben für die neue Spielzeit.",
    ],
  },
  {
    id: "mask-plans",
    title: "Maskenplan vor der Vorstellung",
    module: "productions",
    intro:
      "Der Maskenplan zählt rückwärts: −60 bedeutet 60 Minuten vor Beginn, 0 ist der Vorstellungsbeginn. Jede Personalspalte kann eine oder mehrere Maskenpersonen enthalten.",
    steps: [
      "Öffne die Produktion und den Reiter Maskenplan. Mit Neuer Plan legst du einen benannten Ablauf an, zum Beispiel AMA / HP1+2 / GP / Premiere. Ihr könnt mehrere Pläne je Stück speichern, bearbeiten, duplizieren und löschen.",
      "Füge eine Personalspalte hinzu. Wähle eine oder mehrere aktive Maskenpersonen oder ergänze einzelne freie Namen. In der ersten Spalte wird die eingetragene Maskenbetreuung als Vorschlag angeboten. Weitere Spalten lassen sich danach ergänzen.",
      "Mit Zeitblock wählst du eine Personalspalte, Schauspieler aus der Besetzung und die Dauer. Unter Minuten vor Beginn trägst du eine positive Zahl ein: 30 wird in der Tabelle als −30 angezeigt. Mehrere Schauspieler und freie Namen sind möglich. Für Wege oder Vorbereitung genügt eine Tätigkeit wie Ins Studio rüber.",
      "Ziehe Zeitblock platzieren auf die gewünschte Zeit in einer Personalspalte. Danach öffnet sich das Formular mit dieser Position. Auf dem Smartphone kannst du auch erst Zeitblock platzieren antippen und danach eine freie Stelle in der Tabelle wählen. Platzieren abbrechen beendet die Auswahl.",
      "Bereits angelegte Blöcke kannst du im Zeitplan verschieben. Am Smartphone hältst du einen Block erst kurz gedrückt und ziehst ihn dann zur neuen Zeit oder in eine andere Personalspalte. Ein kurzer Tipp öffnet weiterhin die Bearbeitung. Beim Verschieben bleibt die Dauer erhalten; der Block endet spätestens zum Vorstellungsbeginn.",
      "Ein Block darf spätestens bei 0 enden. Das Zeitraster ist nur die Einteilung der Tabelle; die Dauer kann davon abweichen. Tippe einen Block oder einen Spaltenkopf an, um ihn zu ändern. Beim Entfernen einer Spalte werden auch ihre Zeitblöcke entfernt.",
      "Am Smartphone bleibt es eine Zeittabelle mit einer festen Zeitspalte. Verschiebe die Personalspalten seitlich oder wechsle zu Liste, um lange Namen und Hinweise vollständig zu lesen. In der Liste führen verknüpfte Schauspielernamen zum Katalog.",
      "Mit Vorstellungsbeginn kannst du zusätzlich echte Uhrzeiten anzeigen, zum Beispiel bei einem Beginn um 19:30. Das ändert nur deine Ansicht; die gespeicherten Abstände bleiben für andere Vorstellungstage gleich.",
      "Änderungen bleiben zunächst im Entwurf. Plan speichern übernimmt alle Änderungen gemeinsam. Verwerfen lädt den gespeicherten Stand. Wenn jemand den Plan in der Zwischenzeit geändert hat, bleiben deine Eingaben erhalten: Lade den aktuellen Stand oder behalte deinen Entwurf als neuen Plan. Hinweise auf Überschneidungen verhindern das Speichern nicht.",
      "Speichere vor dem Export. PDF ist die druckbare Zeittabelle, Excel eignet sich zur Weiterarbeit, CSV zeigt die Zeitblöcke und JSON enthält den vollständigen Plan. Ein eingetragener Vorstellungsbeginn erscheint auch im Export.",
    ],
  },
  {
    id: "people",
    title: "Ansprechpersonen & Kontaktdaten",
    module: "people",
    intro:
      "Ansprechpersonen ist euer Kontaktverzeichnis, etwa für Regie, Kostüm oder Gäste. Schauspieler haben einen eigenen Katalog; Benutzerkonten sind die Zugänge zum Tool.",
    steps: [
      "Suche nach Name, Funktion oder Kontaktdaten und grenze die Liste bei Bedarf auf eine Organisation ein. Alle freigegebenen Teammitglieder können die Kontakte lesen.",
      "Alle freigegebenen Teammitglieder legen Personen mit Name, Organisation, Funktion, E-Mail, Telefon und Notizen an. Ein Kontakt erhält weder einen Zugang noch eine automatische Zuordnung zum Kalenderteam.",
      "Öffne die Kontaktdetails, um E-Mail, Telefon und verknüpfte Produktionen zu sehen. Die aktuelle Spielzeit ist vorausgewählt; ältere findest du über die Spielzeitauswahl. In der Produktion führt ein verknüpfter Kontaktname wieder zu diesen Details.",
      "Wähle denselben Kontakt in mehreren Produktionen. Die Rolle, etwa Regieassistenz, wird jeweils bei der Produktion angegeben.",
      "Bisherige Maskenkontakte mit freigegebenem Teamkonto erscheinen als Teammitglieder. Ihre Angaben bleiben gespeichert. Bei mehreren passenden Namen erfolgt keine automatische Verknüpfung; wählt dann das richtige Teammitglied in der Produktion.",
    ],
    note: "Ein Kontakt, der noch einer Produktion zugeordnet ist, lässt sich nicht löschen. Entferne zuerst die Zuordnung. Bei gleichen Namen prüfe die Organisation und Funktion, bevor du einen weiteren Eintrag anlegst.",
  },
  {
    id: "tasks",
    title: "Aufgaben, Kanban & Sprints",
    module: "tasks",
    intro:
      "Produktionsaufgaben gehören ins Kanban des Stücks; allgemeine Aufgaben gehören ins Teamboard.",
    steps: [
      "Öffne im Stück Aufgaben & Sprints. Neue Aufgaben bleiben dieser Produktion zugeordnet. Im Teamboard wird keine Produktion zugeteilt.",
      "Am Smartphone startet die Aufgabenansicht als Liste. Sie zeigt Aufgaben nach Status mit ihren Anzahlen. Über Liste und Kanban wechselst du zur Spaltenansicht und zurück. Suche, Meine Aufgaben und die Spielzeitauswahl gelten in beiden Ansichten.",
      "Das Teamboard startet mit der aktuellen Spielzeit von August bis Juli. Über Spielzeit findest du frühere Aufgaben oder Alle Spielzeiten. Neue Teamaufgaben übernehmen die gewählte Spielzeit; im Aufgabenformular kannst du sie ändern. Unteraufgaben übernehmen die Spielzeit der Hauptaufgabe. In einem älteren Stück siehst du automatisch dessen eigene Spielzeit.",
      "Ergänze Verantwortliche, Priorität, Fälligkeitsdatum und eine Checkliste. Unteraufgaben behalten den Arbeitsraum ihrer übergeordneten Aufgabe.",
      "Verschiebe eine Aufgabe zwischen den Spalten oder ändere ihren Status im Auswahlfeld. Das funktioniert auch am Smartphone ohne Ziehen.",
      "Alle freigegebenen Teammitglieder planen Sprints innerhalb der Produktion mit frei gewähltem Start, Ende und Ziel. Die Sprintauswahl filtert das Board.",
      "Ihr könnt alle Aufgaben in zugänglichen Produktionen und im Teamboard bearbeiten und verschieben, auch wenn sie einer anderen Person zugeteilt sind.",
    ],
  },
  {
    id: "casting",
    title: "Figuren, Besetzung & Bilder",
    module: "productions",
    intro: "Figuren und Schauspieler werden innerhalb einer Produktion zugeordnet.",
    steps: [
      "Öffne im Stück Besetzung. Hier ordnest du Figuren und Schauspielpersonen zu und pflegst ihre Bilder.",
      "Speichere eine Besetzung zuerst. In der Detailansicht kannst du unter Bilder dieser Besetzung mehrere Bilder zugleich hinzufügen. Bereits vorhandene Bilder einer verknüpften Figur sind darunter weiter sichtbar; über Figur öffnen erreichst du deren Angaben.",
      "Wähle unter Besetzung die Figur und Schauspielperson aus den vorhandenen Einträgen. Fehlende Einträge kannst du direkt dort anlegen; danach sind sie ausgewählt und die übrigen Formulareingaben bleiben erhalten.",
      "Über Namen frei eintragen kannst du Figur und Schauspielperson auch ohne Katalogeintrag angeben. Markiere bei Bedarf eine alternierende Besetzung. Auch Besetzungen haben eine eigene Galerie.",
      "Beim Bearbeiten einer Besetzung zeigt die Übersicht zum Besetzungswechsel direkt zugeordnete Aufschriebe sowie allgemeine Aufgaben und Dienste der Produktion.",
      "Prüfe betroffene Informationen fachlich. Ein Besetzungswechsel ändert Aufschriebe, Aufgaben oder Dienste nicht automatisch.",
    ],
  },
  {
    id: "actors",
    title: "Schauspielerkatalog",
    module: "actors",
    intro: "Der zentrale Katalog sammelt Informationen unabhängig von einer einzelnen Produktion.",
    steps: [
      "Alle freigegebenen Teammitglieder legen Schauspieler an und pflegen Name, Kontakt, Haare, Perückenmaß und wichtige Hinweise.",
      "Der Katalog zeigt zuerst das Ensemble der aktuellen Spielzeit. Wähle eine andere Spielzeit oder Alle Spielzeiten, um frühere Einträge zu sehen. Unter Bearbeiten kannst du bei einer Person Spielzeiten einzeln hinzufügen oder entfernen. Eine Person kann in mehreren Spielzeiten dabei sein; ihre Maskenangaben und Besetzungen bleiben im selben Profil.",
      "Am Smartphone öffnest du die Jahr- und Spielzeitauswahl über Zeitraum auswählen. Unter Mehr stehen Import und Export sowie für Admins Ensemble laden. Die Suche und Schauspieler anlegen bleiben direkt erreichbar.",
      "Jede Schauspielperson hat ein Porträt. Ein neues Bild ersetzt das bisherige Porträt. Der Kartenausschnitt richtet sich am erkannten Gesicht aus; weitere Dokumente kannst du zusätzlich hochladen.",
      "Klicke in einer Besetzung oder Figur auf den Schauspielnamen, um den Katalogeintrag zu öffnen. Unter Spielt mit in findest du eure verknüpften Produktionen und Rollen sowie die Aufschriebe. Standard ist die aktuelle Spielzeit; über den Filter siehst du auch frühere oder alle Spielzeiten.",
      "Admins können über Ensemble laden die offizielle Liste des Stadttheaters ansehen. Die Ziel-Spielzeit ist zunächst die aktuelle, auch wenn du gerade ältere Einträge ansiehst. Die Website zeigt die derzeitige Liste; sie liefert kein historisches Archiv. Wähle vor dem Laden die passende Ziel-Spielzeit. Die Vorschau zeigt neue Personen, Aktualisierungen und unklare Zuordnungen. Wähle die gewünschten Personen und klicke Importieren.",
      "Der Import übernimmt Namen und Porträts von Ensemble und Gästen aus Schauspiel und Jungem Theater. Eure Maskenangaben und Produktionszuordnungen bleiben erhalten; pro Person wird ein Porträt verwendet. Theaterbiografien und Stücklisten von der Theaterwebsite werden nicht angezeigt. Zusätzliche Schauspieler bleiben im Katalog.",
      "Die Angaben werden nur bei einem Import geladen. Ein erneuter Import ergänzt fehlende Fotos, aktualisiert geänderte Angaben und fügt die Ziel-Spielzeit hinzu. Frühere Spielzeiten und zusätzliche Schauspieler bleiben erhalten; identische Datensätze werden nicht erneut gespeichert. Exportieren übernimmt die gewählte Spielzeit.",
    ],
  },
  {
    id: "looks",
    title: "Aufschriebe, Vorlagen & Versionen",
    module: "documentation",
    intro:
      "Der Aufschrieb heißt wie die Schauspielperson und ist für das freigegebene Team sichtbar. Ein eigener Titel, eine Szene und ein Veröffentlichungsstatus werden nicht benötigt.",
    steps: [
      "Öffne Aufschriebe im Stück oder den zentralen Sammelordner. Dort findest du Produktionsaufschriebe, auch zu archivierten Stücken, und allgemeine Aufschriebe ohne Produktion. Suche oder filtere nach Produktion, Jahr und Spielzeit.",
      "Wähle die Schauspielperson aus dem Katalog oder trage ihren Namen frei ein. Eine Figur kannst du zusätzlich auswählen oder benennen. Fehlende Katalogeinträge kannst du direkt anlegen.",
      "Beginne mit Vorbereitung. Danach folgen Makeup, Haare, Perücken und Bärte, Umbau & Wechsel und Einrichten. Mit Textfeld hinzufügen ergänzt du einzelne Einträge; kurze Labels und die Reihenfolge helfen beim Lesen.",
      "Die Stückdauer kommt aus der Produktion. Trage im Aufschrieb nur dann eine eigene Dauer in Minuten ein, wenn sie abweicht. Gemeint ist die Länge des Stücks, nicht die Arbeitszeit in der Maske.",
      "Wähle bei Bedarf eine Vorlage. Sie ergänzt ihre Textfelder, ohne vorhandene Texte zu ersetzen. Ihr pflegt Vorlagen gemeinsam unter Aufschriebe → Vorlagen. Sichtbare Aufschriebe könnt ihr gemeinsam bearbeiten; frühere private Entwürfe bleiben geschützt. Bilder ergänzst du nach dem Speichern in der Galerie.",
      "Im Versionsverlauf bleiben ältere Stände einsehbar. Historische Szenen- und Zeitbedarfangaben aus alten Aufschrieben bleiben erhalten. PDF ist für lesbare Ausdrucke vorgesehen; Excel, CSV und JSON eignen sich zur Weiterverarbeitung.",
    ],
  },
  {
    id: "shared-documents",
    title: "Dokumente gemeinsam bearbeiten",
    module: "productions",
    intro:
      "Ihr arbeitet im selben gemeinsamen Dokument. Änderungen werden automatisch zusammengeführt; beim Herunterladen erhältst du den aktuellen Stand.",
    steps: [
      "Öffne in einer Produktion Dokumente. Über Dokument anlegen startest du ein Textdokument oder eine Tabelle. Über Hochladen ergänzt du Word (.docx), Excel (.xlsx), CSV oder PDF. Bilder werden weiterhin als Bilder geöffnet.",
      "Im Chat kannst du eine Datei hochladen oder über Gemeinsames Dokument direkt eines anlegen. Alle Personen mit Zugriff auf diesen Chat oder die Produktion können dasselbe Dokument öffnen und bearbeiten, auch gleichzeitig. Dateien in privaten Chats bleiben für deren Teilnehmende zugänglich.",
      "Word übernimmt auch Schriftfarben, Schriftgrößen und einfache Schriftformate. Mit Schriftfarbe in der Werkzeugleiste färbst du ausgewählten Text ein. Excel zeigt Zellfarben, Schriftfarben, Rahmen, Zeilenhöhen, Spaltenbreiten und verbundene Zellen. Wähle eine Zelle und ändere den Wert im Feld darüber. Du kannst Tabellenbereiche aus Excel einfügen; bei verbundenen Zellen schützt eine Meldung vor dem Überschreiben versteckter Werte.",
      "Nach Änderungen zeigt Wird gespeichert den ausstehenden Stand. Gespeichert bedeutet, dass eure Änderungen übertragen wurden. Ohne Verbindung werden Änderungen bei verfügbarem Gerätespeicher lokal behalten und später synchronisiert. Schließe das Dokument möglichst erst nach der Speicherung.",
      "Über Herunterladen erhältst du euren aktuellen gemeinsamen Stand als Word-, Excel- oder PDF-Datei. Weitere Formate findest du direkt daneben. Speichern sichert den Stand zusätzlich; mit Original lädst du die ursprünglich hochgeladene Datei herunter.",
      "Bei früher hochgeladenen Dateien ergänzen wir fehlende Farben aus dem Original beim nächsten Öffnen. Eure geänderten Texte und Zellwerte bleiben dabei erhalten. Wenn ein alter Word-Absatz schon geändert wurde, ergänzen wir seine ursprünglichen Farben nur bei eindeutiger Zuordnung.",
      "Bei PDF bleibt der Originalinhalt erhalten. Unter Gemeinsame Notizen ergänzt ihr Hinweise zu einer Seite. Alle berechtigten Personen können die Notizen bearbeiten. Der PDF-Download enthält das Original und eure Notizen auf zusätzlichen Seiten.",
    ],
    note: "Komplexe Word-Seitenlayouts und erweiterte Excel-Funktionen können im Browser abweichen. Hinweise zur übernommenen Datei stehen im geöffneten Dokument. Prüfe einen Ausdruck vor der Verwendung. Die ursprüngliche Datei bleibt immer erhalten.",
  },
  {
    id: "calendar",
    title: "Kalender, Freiwünsche & Ausdrucke",
    module: "calendar",
    intro: "Die persönliche Ansicht und die Teamplanung verwenden dieselben freigegebenen Termine.",
    steps: [
      "Die Uhrzeit in der Tages- und Wochenansicht beginnt um 06:00 und endet um 01:00 am folgenden Tag. So bleiben auch späte Vorstellungen sichtbar. Monat, Agenda und Teamübersicht zeigen weiterhin alle Termine.",
      "Wähle Monat, Woche, Tag, Agenda oder Team. Unter Team kannst du Teamwoche oder Teammonat wählen. Am Smartphone siehst du ein Kalenderfeld für jeden Tag, ohne breite Namensspalte. Die Zahlen und Farbpunkte zeigen Termine an. Tippe einen Tag an: Die Tagesliste öffnet sich mit vollständigen Namen, Zeiten und Angaben. Auf größeren Bildschirmen bleibt die Teamtabelle verfügbar.",
      "Am Smartphone sind die Filter zunächst eingeklappt. Tippe oberhalb des Kalenders auf die Kalenderauswahl, um Personen, Produktion, Kategorie, Jahr und Spielzeit zu ändern. Alle zeigt das ganze Team, Nur ich deinen eigenen Kalender. Im persönlichen Monatskalender zeigt ein Tipp auf einen Tag dessen Termine; mit Termin an diesem Tag legst du einen neuen Eintrag an.",
      "Zu Beginn siehst du nur deinen Kalender. Hake weitere Personen an, um ihre Termine dazuzuschalten. Alle anzeigen zeigt den gesamten Teamkalender. Die Teamansicht startet mit allen Personen; danach kannst du sie einschränken. Zurück in der persönlichen Ansicht gilt wieder deine vorige Auswahl. Ohne angehakte Personen bleibt der Kalender leer. Der Superadmin wählt zuerst Personen oder Alle anzeigen.",
      "Als Teammitglied kannst du Termine und Dienste in deinem eigenen Kalender anlegen, bearbeiten, verschieben und löschen. Admins können auch Einträge für andere Personen und mehrere Personen zugleich planen. Wähle Zeitraum und eine vorhandene Kalenderart. Der Titel darf leer bleiben: dann wird das Stück oder die Kalenderart angezeigt. Ganztägige Arten brauchen nur Von- und Bis-Tage, keine Uhrzeiten.",
      "Termine mit Produktion verwenden die Farbe des Stücks, andere die Farbe ihrer Kalenderart. Bei einer Produktion steht auch die Kalenderart im Titel, etwa Gym – AMA. Einen zusätzlichen eigenen Titel siehst du dahinter. Ganztägige Einträge haben einen helleren Hintergrund; ihre Schrift bleibt gut lesbar.",
      "Am Smartphone findest du Exportieren und Freien Tag wünschen oben unter Aktionen. Admins können dort unter Kalenderarten Namen, Farbe und ganztägige Arten pflegen. Verwendete Arten lassen sich nicht löschen oder zwischen Uhrzeiten und ganztägig umstellen. Teammitglieder wünschen freie Tage; ein Admin wählt bei der Genehmigung eine ganztägige Art.",
      "Im Produktionskalender ist das Stück fest vorgegeben. Im allgemeinen Kalender kannst du Produktionen und Kategorien filtern.",
      "Exportieren übernimmt Ansicht, Zeitraum und Personenauswahl. PDF ist für Druck, ICS für Kalender, Excel und CSV für Tabellen vorgesehen.",
      "Unter Einstellungen lässt sich ein persönlicher Kalenderlink für Outlook oder Apple Kalender erstellen und wieder widerrufen.",
    ],
  },
  {
    id: "time",
    title: "Zeit buchen, korrigieren & freigeben",
    module: "time",
    intro:
      "Anwesenheit zeigt deine Zeit im Theater. Arbeitszeiten zeigen deine Tätigkeiten, mit oder ohne Produktion. Beide bleiben getrennt.",
    steps: [
      "Anwesenheits- und Arbeitstimer dürfen gleichzeitig laufen. Unter Anwesenheit trägst du Beginn, Ende und Pause nach. Unter Produktions- / Arbeitszeiten buchst du eine Tätigkeit mit Dauer oder Zeitraum.",
      "Am Smartphone bleiben beide Timer kompakt sichtbar. Öffne die Angaben, wenn du die Tätigkeit, Produktion oder Kategorie ändern möchtest. Ein laufender Timer bleibt auch bei geschlossenen Angaben erkennbar.",
      "Pausiere den Timer bei Bedarf. Stoppen & buchen legt die Zeitbuchung an. Timer verwerfen entfernt einen ungebuchten Lauf nach Bestätigung.",
      "Wähle bei einer Buchung Bearbeiten, um Datum, Dauer, Beginn, Ende oder Pause zu korrigieren. Alle Rollen können eigene Zeiten ändern; Admins auch Zeiten anderer Teammitglieder. Korrigierte Produktionswochen werden bei Bedarf erneut zur Prüfung geöffnet.",
      "Unter Wochenverlauf stehen frühere Wochen mit Kalenderwoche, Datum und Stundensumme. Klappe eine Woche auf, um die einzelnen Buchungen zu lesen oder zu bearbeiten. Anwesenheit und Produktionsarbeit haben jeweils ihren eigenen Verlauf.",
      "Mit der Wochenauswahl wechselst du auch zu leeren oder älteren Wochen. Für Einträge aus früheren Spielzeiten öffnest du Zeitraum auswählen und wählst die passende oder Alle Spielzeiten. Die Filter für Person und Produktion gelten auch im Verlauf.",
      "Kalenderzeiten prüfen zeigt ungeprüfte Vorschläge aus deinen bereits beendeten Kalenderterminen. Öffne einen Vorschlag, vergleiche ihn mit deiner tatsächlichen Arbeit und korrigiere Beginn, Ende, Pause oder Tätigkeit. Erst dein ausdrückliches Speichern bucht die Zeit. Kalendertermine allein sind keine gebuchten Stunden.",
      "Ganztägige freie Tage und Abwesenheiten werden nicht als Arbeitszeit vorgeschlagen. Bereits gebuchte Zeiträume werden berücksichtigt. Prüfe die Vorschläge spätestens beim Rückblick auf die vergangene Woche; Anwesenheit und Tätigkeiten bestätigst du getrennt.",
      "Die Wochenübersicht zeigt auch ABF, Ruhetag, Urlaub und andere ganztägige Kennzeichnungen aus deinem Kalender. Über Tag kennzeichnen kannst du eine vorhandene Kalenderart für deinen Tag wählen. Diese Kennzeichnungen erzeugen keine Arbeitsstunden. Besprechung, Aufräumen und andere Tätigkeiten lassen sich weiterhin ohne Produktion buchen.",
      "Beim PDF-Export stehen Kalenderkennzeichen in einer zusätzlichen Wochenübersicht. Im Excel-Export findest du sie auf dem Blatt Kalenderkennzeichen. Die Stundensummen enthalten weiterhin nur tatsächlich gebuchte Zeit.",
      "Die Tages- und Wochensummen berücksichtigen Mitternacht. Der Wochenvergleich zeigt Anwesenheit und Tätigkeiten nebeneinander. In einer Produktion stehen nur ihre Arbeitszeiten.",
      "Reiche die vollständige Woche unter Produktions- / Arbeitszeiten zur Freigabe ein. Anwesenheit wird getrennt exportiert und gehört nicht zu dieser Freigabe.",
      "Offlineentwürfe liegen auf dem Gerät. Übernehme unzugeordnete Geräteentwürfe ausdrücklich in deinen Account und synchronisiere sie anschließend. Auf gemeinsam genutzten Geräten zuerst die Tätigkeit prüfen.",
    ],
  },
  {
    id: "chat",
    title: "Kommunikation & Dateien",
    module: "chat",
    intro:
      "Teile Informationen mit der Maske, einem Produktionsteam oder ausgewählten Personen in einem privaten Chat.",
    steps: [
      "Admins können mit Teamkanal einen weiteren Kanal anlegen. Darin kann das ganze Maskenteam schreiben, auch neue Kolleginnen nach der Freigabe ihres Zugangs. Admins können den Kanal umbenennen oder archivieren; Nachrichten bleiben erhalten.",
      "Nutze Maske · Allgemein für Informationen an die Abteilung oder den Projektchat für Absprachen zum Stück.",
      "Neue Nachrichten und Änderungen im Team erscheinen automatisch. Live verbunden zeigt, dass die Verbindung steht. Im Hintergrund pausiert sie; beim Zurückkehren werden verpasste Änderungen nachgeholt. Bei einer Störung kannst du die Verbindung erneut versuchen.",
      "Die roten Zähler zeigen ungelesene Nachrichten. Chats mit neuen Nachrichten stehen unter Ungelesen ganz oben, egal ob Teamkanal, Produktion, Direktnachricht oder Gruppe. Der neueste steht zuerst. Nach dem Lesen wandert der Chat zurück in seinen normalen Bereich. Suche und Archivfilter gelten auch für Ungelesen.",
      "Klicke auf eine Gruppenüberschrift, um ihre Kanäle auf- oder zuzuklappen. Produktionen sind zunächst geschlossen, die anderen Gruppen geöffnet. Die App merkt sich deine Auswahl auf diesem Gerät. Eine Suche öffnet die passenden Gruppen automatisch.",
      "Am Desktop kannst du die Kanalauswahl im Chatkopf einklappen und wieder öffnen; die App merkt sich die Auswahl auf diesem Gerät. Am Smartphone öffnest du die Kanalliste direkt über den Kanalnamen im Chatkopf.",
      "Der Chat bleibt gleich hoch, auch wenn viele Nachrichten hinzukommen. Scrolle im Nachrichtenverlauf nach oben, um ältere Beiträge zu lesen. Das Eingabefeld bleibt darunter; die Kanalliste lässt sich am Desktop unabhängig scrollen.",
      "Wähle Privater Chat und eine Person oder mehrere Personen für eine Gruppe. Am Smartphone findest du neue Chats, Export und Verwaltung unter Chataktionen (die drei Punkte). Private Verläufe und Dateien sehen nur die Teilnehmenden, auch Admins benötigen eine Teilnahme.",
      "Am Smartphone steht der Nachrichtenverlauf im Mittelpunkt. Über den Plus-Button neben dem Eingabefeld öffnest du Anhänge und Dokumente: Dort kannst du Dateien auswählen oder ein gemeinsames Dokument anlegen. Das Eingabefeld wächst beim Schreiben mehrerer Zeilen bis zu einer begrenzten Höhe.",
      "Eigene Nachrichten kannst du bearbeiten oder löschen. Der Ersteller eines privaten Chats verwaltet Namen und Gruppenmitglieder oder archiviert ihn. Archivierte Chats bleiben lesbar und lassen sich wieder öffnen. Beim Chatwechsel werden ungesendete Texte und Anhänge verworfen.",
    ],
  },
  {
    id: "push",
    title: "Mitteilungen auf dem Handy",
    module: "settings",
    intro:
      "DigitalMask kann dich auch bei geschlossener App über neue Nachrichten, Aufgaben und Änderungen informieren.",
    steps: [
      "Öffne DigitalMask über ihr App-Symbol. Am Smartphone findest du die Einstellungen unter Mehr. Öffne Mitteilungen auf diesem Gerät, wähle Mitteilungen aktivieren und erlaube die Nachfrage deines Geräts. Für jedes Handy oder jeden Computer entscheidest du getrennt.",
      "Auf iPhone oder iPad zeigt App installieren unten auf der Seite eine kurze Anleitung. Öffne DigitalMask in Safari und füge sie über Teilen zum Home-Bildschirm hinzu. Lass Als Web-App öffnen eingeschaltet, falls die Auswahl erscheint. Die Installation allein aktiviert noch keine Mitteilungen: Öffne die App über ihr Symbol, gehe in DigitalMask zu Einstellungen → Mitteilungen auf diesem Gerät und tippe auf Mitteilungen aktivieren. Erlaube die iOS-Nachfrage und wähle anschließend Testmitteilung. Dafür brauchst du iOS oder iPadOS 16.4 oder neuer.",
      "Wenn du die Nachfrage zuvor abgelehnt hast, öffne auf dem iPhone Einstellungen → Mitteilungen → DigitalMask → Mitteilungen erlauben. Gehe danach zurück in die App und prüfe den Status erneut.",
      "Unter Android findest du die Freigabe in den Handy-Einstellungen unter Apps → DigitalMask → Benachrichtigungen. Wenn der Empfang über Chrome läuft, prüfe auch Chrome → Einstellungen → Website-Einstellungen → Benachrichtigungen. Die Namen der Menüs können je nach Handy abweichen.",
      "Mit Testmitteilung prüfst du den Empfang. Deaktivieren schaltet Mitteilungen auf diesem Gerät aus. Beim Abmelden wird die Verbindung dieses Geräts ebenfalls beendet.",
      "Der Punkt oder Zähler am App-Symbol zeigt ungelesene Mitteilungen. Er wird beim Empfang und Öffnen der App aktualisiert; beim Lesen sinkt er. Auf anderen gerade geschlossenen Geräten kann der Zähler bis zur nächsten Mitteilung oder zum Öffnen der App abweichen.",
      "Falls Mitteilungen ausbleiben, prüfe die Geräte- oder Browser-Einstellungen, den Fokusmodus und die Verbindung. Android entscheidet je nach Launcher, ob ein Punkt oder eine Zahl angezeigt wird. Nachrichteninhalte und persönliche Planungsangaben erscheinen erst nach dem Öffnen der App.",
    ],
  },
  {
    id: "inventory",
    title: "Fundus & Materialwissen",
    module: "inventory",
    intro: "Lagerorte, Bestand und Hinweise halten euer Materialwissen zusammen.",
    steps: [
      "Erfasse Material mit Lagerort, Bestand und Mindestbestand. Nur Einkaufsbedarf zeigt Einträge unter der gewünschten Menge.",
      "Im Detail eines Funduseintrags findest du einen QR-Code. Er führt nach Anmeldung direkt zum Material.",
      "Wähle die passende Funduskategorie. Admins können die Bezeichnungen, Farben und Reihenfolge für eure Materialien anpassen.",
    ],
  },
  {
    id: "handovers",
    title: "Dienstübergaben & Checklisten",
    module: "handovers",
    intro:
      "Dienstübergaben stehen gemeinsam im Bereich Dienstübergaben. Sie benötigen keine Produktionszuordnung, kein Vorstellungsdatum und keinen Status.",
    steps: [
      "Lege eine Übergabe mit einem verständlichen Titel an. Beschreibe unter Worauf muss ich achten die wichtigen Punkte und unter Allgemeine Hinweise weitere Absprachen.",
      "Mit Textfeld hinzufügen ergänzt du mehrere getrennte Hinweise. Optional kannst du kurze Labels vergeben und die Einträge umordnen.",
      "Füge der Checkliste für jede Aufgabe einen eigenen Punkt hinzu. Punkte lassen sich bearbeiten, abhaken, verschieben und entfernen.",
      "Speichere die Übergabe und ergänze bei Bedarf mehrere Bilder in der Galerie. Alle berechtigten Teammitglieder können die Übergabe lesen; PDF eignet sich zum Ausdrucken.",
    ],
  },
  {
    id: "categories",
    title: "Eigene Fachkategorien",
    module: "inventory",
    intro:
      "Admins pflegen Tätigkeitsbereiche für Arbeitszeiten, Funduskategorien und Textabschnitte für Aufschriebe und Übergaben.",
    steps: [
      "Öffne die Kategorienverwaltung im jeweiligen Bereich. In Aufschrieben und Übergaben heißt sie Abschnitte verwalten.",
      "Lege eine passende Bezeichnung an und wähle Farbe und Reihenfolge. Die Auswahl und Dokumentüberschriften verwenden eure Bezeichnungen.",
      "Ungenutzte Kategorien lassen sich löschen. Ist eine Kategorie bereits in einer Buchung, einem Materialeintrag, Dokument oder einer Vorlage verwendet, bleibt sie geschützt. Entferne zuerst die Verwendung, wenn du sie löschen möchtest.",
    ],
    note: "Kalenderarten werden weiterhin getrennt im Kalender verwaltet.",
  },
  {
    id: "periods",
    title: "Frühere Jahre, Spielzeiten & Exporte",
    module: "documentation",
    intro: "Mit Jahr und Spielzeit findest du auch ältere Produktionsarbeit wieder.",
    steps: [
      "Kalender und Zeitnachweise öffnen mit der aktuellen Spielzeit von August bis Juli. Jahr und Spielzeit sind kompakte Filter. Mit Alle Spielzeiten oder Zeitraum zurücksetzen kannst du weitere Zeiträume sehen.",
      "Wähle Jahr und Spielzeit in der jeweiligen Übersicht. Im Sammelordner kannst du zusätzlich eine Produktion oder allgemeine Aufschriebe auswählen; archivierte Produktionen bleiben auffindbar.",
      "Bei Produktionsdokumenten zählt die Spielzeit beziehungsweise das Premierenjahr des Stücks. Bei allgemeinen Aufschrieben zählt das Erstellungsjahr. Zeitbuchungen und Anwesenheit richten sich nach dem tatsächlich gebuchten Tag.",
      "Öffne Exportieren aus der gefilterten Übersicht. Produktion, Jahr und Spielzeit werden übernommen. Prüfe bei Zeit- und Kalenderexporten zusätzlich den Zeitraum, damit er zur gewählten Auswahl passt.",
    ],
  },
  {
    id: "roles",
    title: "Zugänge & Rollen",
    module: "settings",
    intro: "Accounts und Mitarbeiterzuordnungen erfüllen unterschiedliche Aufgaben.",
    steps: [
      "Neue Teammitglieder registrieren sich mit Benutzername und Passwort. Ein Admin gibt ihren Zugang frei.",
      "Das Team arbeitet gemeinsam an Produktionen, Kontakten, Besetzung, Aufgaben, Sprints, Aufschrieben und Vorlagen. Du planst deinen eigenen Kalender, buchst deine eigenen Zeiten und stellst Freiwünsche. Kalenderplanung für andere Personen, Kategorien, Zugangsverwaltung sowie die Freigabe von Freiwünschen und Wochen bleiben bei Admins.",
      "Der Superadmin vergibt Adminrollen und bearbeitet den zentralen Feedbackverlauf. Ein Superadmin ist ein Systemkonto und erscheint nicht als neue Mitarbeiterauswahl.",
      "Passwörter werden im Profil geändert. Bei einem vergessenen Passwort erstellt ein Admin einen Wiederherstellungscode, der auf der Anmeldeseite verwendet werden kann.",
      "Wähle in deinen Einstellungen eine persönliche Akzentfarbe. Die fachlichen Farben von Terminen, Status und Produktionen behalten ihre Bedeutung.",
    ],
  },
];
export const helpFaq = [
  [
    "Wie installiere ich DigitalMask auf meinem iPhone oder Android-Handy?",
    "Die Anleitung App auf dem Smartphone installieren zeigt beide Wege mit Kurzvideos: Auf dem iPhone öffnest du DigitalMask in Safari und fügst sie über Teilen zum Home-Bildschirm hinzu. Unter Android nutzt du App installieren oder das Chrome-Menü. Starte die App danach über ihr Symbol und melde dich an.",
  ],
  [
    "Warum bekomme ich nach der Installation noch keine Handy-Mitteilungen?",
    "Die Installation allein reicht nicht. Öffne die App über ihr Symbol und gehe unter Mehr zu Einstellungen → Mitteilungen auf diesem Gerät. Tippe auf Mitteilungen aktivieren und erlaube die Nachfrage. Prüfe den Empfang mit Testmitteilung. Auf iPhone und iPad brauchst du mindestens iOS beziehungsweise iPadOS 16.4.",
  ],
  [
    "Laden die Kurzvideos automatisch und verbrauchen sie Speicher?",
    "Ein Video wird erst geladen, wenn du es öffnest und die Wiedergabe startest. Die kurzen Clips sind ohne Ton, mit eingeblendeten Erklärungen. Du kannst dieselben Schritte auch als Text lesen. DigitalMask lädt keine komplette Videobibliothek auf dein Handy.",
  ],
  [
    "Kann ich mit anderen an derselben Word- oder Excel-Datei arbeiten?",
    "Ja. Öffnet denselben Dateianhang oder dasselbe Dokument in einer Produktion. Ihr bearbeitet einen gemeinsamen Stand, der automatisch zusammengeführt wird. Herunterladen enthält die aktuellen Änderungen als Word oder Excel. Das Original bleibt zusätzlich verfügbar; komplexe Office-Funktionen können im Browser eingeschränkt sein.",
  ],
  [
    "Was passiert, wenn zwei Personen gleichzeitig etwas ändern?",
    "Textänderungen werden zusammengeführt. In Tabellen bleiben Änderungen an verschiedenen Zellen erhalten. Wenn beide genau dieselbe Zelle bearbeiten, setzt sich ein Wert durch. Sprecht euch bei längeren Änderungen an derselben Tabellenstelle kurz ab.",
  ],
  [
    "Kann ich ein PDF zusammen mit dem Team ändern?",
    "Ihr ergänzt und bearbeitet gemeinsame Notizen zu einzelnen Seiten. Der PDF-Inhalt bleibt unverändert. Beim Herunterladen werden die Notizen als zusätzliche Seiten angefügt.",
  ],
  [
    "Warum klappt die Anmeldung nicht?",
    "Verwende deinen bei der Registrierung gewählten Benutzernamen, nicht deinen Anzeigenamen. Prüfe Tippfehler und die Groß- und Kleinschreibung im Passwort. Neue Zugänge müssen zuerst von einem Admin freigegeben werden. Bei einem vergessenen Passwort hilft dir ein Admin mit einem Wiederherstellungscode.",
  ],
  [
    "Wer kann neue Teamkanäle anlegen?",
    "Admins legen Teamkanäle an und verwalten sie. Das ganze Maskenteam kann sie lesen und darin schreiben, auch später freigegebene Kolleginnen. Private Direkt- und Gruppenchats sind nur für ihre Teilnehmenden sichtbar.",
  ],
  [
    "Was darf ich als normales Teammitglied?",
    "Du kannst gemeinsame Arbeitsinhalte in deinen zugänglichen Bereichen anlegen, bearbeiten und löschen: Produktionen, Kontakte, Schauspieler, Figuren, Besetzungen, Aufgaben, Sprints, Aufschriebe und Vorlagen. Du kannst außerdem deinen eigenen Kalender planen. Kalenderplanung für andere Personen, Kategorien, Benutzerverwaltung und die Freigabe von Freiwünschen oder Wochen sind Adminaufgaben. Persönliche Zeitbuchungen und private Chats bleiben geschützt.",
  ],
  [
    "Warum sehe ich eine Produktion nicht?",
    "Dein Zugang muss freigegeben sein, und du benötigst die entsprechende Produktionsfreigabe. Bitte jemanden mit Zugriff auf die Produktion, die Teamzuordnung zu prüfen.",
  ],
  [
    "Wo kommen allgemeine Aufgaben hin?",
    "Ins Teamboard der aktuellen Spielzeit. Frühere Aufgaben findest du über Spielzeit oder Alle Spielzeiten. Aufgaben zu einem Stück werden direkt unter dessen Aufgaben & Sprints angelegt und bleiben in seiner Spielzeit sichtbar.",
  ],
  [
    "Wo finde ich das Ensemble und die Aufgaben aus früheren Spielzeiten?",
    "Die Übersichten starten mit der aktuellen Spielzeit von August bis Juli. Wähle im Spielzeitfilter ein früheres Jahr oder Alle Spielzeiten. Im Schauspielerkatalog kannst du beim Bearbeiten einer Person mehrere Spielzeiten hinterlegen. Die Besetzungen und Maskenangaben bleiben in einem gemeinsamen Profil erhalten.",
  ],
  [
    "Kann eine externe Person ohne Account eingetragen werden?",
    "Ja. Wähle sie in den Produktionskontakten aus Ansprechpersonen, lege sie direkt an oder trage einen freien Namen ein. Kontaktdaten werden im Verzeichnis wiederverwendet; ein Benutzerkonto entsteht dadurch nicht.",
  ],
  [
    "Was unterscheidet Ansprechpersonen, Schauspieler und Benutzer?",
    "Ansprechpersonen enthält Ansprechpartner mit Kontaktdaten. Der Schauspielerkatalog enthält Angaben für Besetzung und Maskenarbeit. Benutzer melden sich im Tool an und können als Teammitglieder Aufgaben, Dienste und Zeiten erhalten.",
  ],
  [
    "Warum kann ich eine Person oder Kategorie nicht löschen?",
    "Der Eintrag wird noch verwendet, etwa als Produktionskontakt, Tätigkeitsbereich oder Dokumentabschnitt. Entferne zuerst die zugehörigen Verwendungen. Die Fehlermeldung schützt vorhandene Zuordnungen.",
  ],
  [
    "Muss ich einen Aufschrieb veröffentlichen?",
    "Nein. Ein gespeicherter Aufschrieb ist für das berechtigte Team sichtbar. Sein Titel ist der Schauspielername; die Inhalte werden in einzelnen Textfeldern der Abschnitte gepflegt.",
  ],
  [
    "Wo finde ich frühere Aufschriebe und Dienstübergaben?",
    "Aufschriebe stehen im zentralen Sammelordner, einschließlich archivierter Produktionen. Jahr, Spielzeit und Produktion helfen beim Eingrenzen. Dienstübergaben stehen gemeinsam im eigenen Bereich ohne Produktionszuordnung.",
  ],
  [
    "Wie lade ich mehrere Bilder hoch?",
    "Speichere zuerst Figur, Besetzung, Schauspieler oder Aufschrieb. Öffne danach die Galerie und wähle über Hochladen mehrere Dateien.",
  ],
  [
    "Kann ich Zeiten nach der Wochenfreigabe korrigieren?",
    "Ja. Wähle Bearbeiten bei der Buchung. Die betroffene Produktionswoche wird automatisch wieder zur Prüfung geöffnet. Reiche sie danach erneut ein. Anwesenheitszeiten lassen sich unabhängig davon korrigieren.",
  ],
  [
    "Wo finde ich meine Stunden aus früheren Wochen?",
    "Öffne Zeit und den gewünschten Bereich: Anwesenheit oder Produktions- / Arbeitszeiten. Im Wochenverlauf findest du Kalenderwochen mit ihren Summen. Klappe eine Woche auf, um Einträge zu lesen und zu bearbeiten. Für frühere Spielzeiten passe den Zeitraum an oder wähle Alle Spielzeiten.",
  ],
  [
    "Werden Kalendertermine automatisch als Arbeitszeit gebucht?",
    "Nein. Kalenderzeiten prüfen zeigt nur geplante Vorschläge. Prüfe deine tatsächlichen Zeiten und Pausen und speichere die Buchung ausdrücklich. Anwesenheit und Produktionsarbeit bleiben getrennt. Freie Tage und bereits gebuchte Zeiträume werden berücksichtigt.",
  ],
  [
    "Wie trage ich ABF oder Ruhetag auf meiner Wochenübersicht ein?",
    "Nutze Tag kennzeichnen und wähle eine vorhandene ganztägige Kalenderart für deinen Tag. Ein bereits im Kalender markierter Tag erscheint ebenfalls in der Wochenübersicht. Solche Kennzeichnungen erhöhen deine gebuchten Stunden nicht; tatsächliche Arbeit buchst du separat.",
  ],
  [
    "Sind Offlineentwürfe schon im Theater gespeichert?",
    "Nein. Sie liegen zunächst nur auf dem Gerät und werden erst durch deine ausdrückliche Synchronisierung übertragen. Unzugeordnete Geräteentwürfe musst du vorher in deinen Account übernehmen.",
  ],
  [
    "Wie drucke ich einen Kalender?",
    "Wähle die passende Ansicht und die gewünschten Personen. Öffne Exportieren und wähle PDF. Zeitraum und Filter werden übernommen.",
  ],
  [
    "Wo melde ich einen Fehler oder eine Idee?",
    "Unter Hilfe → Ideen & Fehler. Beschreibe den Ablauf und das erwartete Ergebnis. Deine Rückmeldung geht in die Bearbeitungsübersicht des Superadmins.",
  ],
] as const;
