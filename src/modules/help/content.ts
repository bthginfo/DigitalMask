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
    id: "productions",
    title: "Produktionen, Team & Kontakte",
    module: "productions",
    intro:
      "Auf den Produktionskarten siehst du bereits die Maskenbetreuung. Standardmäßig stehen die nächsten Premieren zuerst; über Sortieren nach wechselst du zu Namen oder zuletzt geänderten Stücken.",
    steps: [
      "Öffne Produktionen und wähle ein Stück. Alle freigegebenen Teammitglieder können Produktionen anlegen und zugängliche Produktionen bearbeiten, archivieren oder löschen. Wenn du ein Produktionsteam auswählst, bleibst du als Ersteller automatisch dabei.",
      "Unter Team & Kontakte lassen sich Rollen frei benennen, etwa Regie, Kostüm oder Maskenbetreuung. Wähle externe Kontakte aus Ansprechpersonen, damit ihre Kontaktdaten wiederverwendet werden.",
      "Fehlt eine Person, kannst du sie direkt im Kontaktformular anlegen oder ihren Namen frei eintragen. Beim Speichern der Produktion wird ein neuer freier Kontakt im Verzeichnis hinterlegt. Es entsteht kein Benutzerkonto.",
      "Für die Maskenbetreuung kannst du ein aktives Teammitglied, eine Person aus dem Verzeichnis oder einen freien Namen wählen. Nur ein ausgewähltes Teammitglied gehört dadurch automatisch zum Produktionsteam.",
      "Wenn eine bisher frei eingetragene Maskenperson einen Account erhält und ein Admin ihn freigibt, werden eindeutige Zuordnungen automatisch auf das Teamkonto umgestellt. Das klappt auch mit einem abgekürzten Nachnamen, etwa Julia G., wenn nur eine Person dazu passt.",
      "Weitere Teammitglieder lassen sich getrennt hinzufügen. Um eine verknüpfte Maskenbetreuung aus dem Team zu entfernen, zuerst den Kontakt entfernen oder auf einen freien Namen umstellen.",
      "Bei einer Wiederaufnahme könnt ihr die Produktion kopieren. Prüft anschließend Termine, Aufgaben und fachliche Angaben für die neue Spielzeit.",
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
      "Öffne die Kontaktdetails, um vorhandene E-Mail- oder Telefonlinks zu nutzen. Ihr könnt dort den Eintrag bearbeiten oder löschen, solange er nicht mehr verwendet wird.",
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
      "Öffne im Stück Figuren & Besetzung. Unter Figuren & Bilder kannst du eine Figur mit Beschreibung anlegen.",
      "Speichere den Eintrag zuerst. Die Detailansicht öffnet sich anschließend mit Bilder & Dateien. Dort können mehrere Bilder zugleich hochgeladen werden.",
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
      "Öffne einen Katalogeintrag, um mehrere Fotos und Dateien hochzuladen oder vorhandene Bilder anzusehen.",
      "Produktionsbesetzungen verwenden die Schauspieler aus diesem Katalog. So müssen Stammdaten nicht für jedes Stück neu erfasst werden.",
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
    id: "calendar",
    title: "Kalender, Freiwünsche & Ausdrucke",
    module: "calendar",
    intro: "Die persönliche Ansicht und die Teamplanung verwenden dieselben freigegebenen Termine.",
    steps: [
      "Wähle Monat, Woche, Tag, Agenda oder Team. Unter Team kannst du Teamwoche oder Teammonat wählen. Am Smartphone siehst du ein Kalenderfeld für jeden Tag, ohne breite Namensspalte. Die Zahlen und Farbpunkte zeigen Termine an. Tippe einen Tag an: darunter stehen die vollständigen Namen, Zeiten und Angaben. Auf größeren Bildschirmen bleibt die Teamtabelle verfügbar.",
      "Am Smartphone sind die Filter zunächst eingeklappt. Tippe oberhalb des Kalenders auf die Kalenderauswahl, um Personen, Produktion, Kategorie, Jahr und Spielzeit zu ändern. Alle zeigt das ganze Team, Nur ich deinen eigenen Kalender. Im persönlichen Monatskalender zeigt ein Tipp auf einen Tag dessen Termine; mit Termin an diesem Tag legst du einen neuen Eintrag an.",
      "Zu Beginn siehst du nur deinen Kalender. Hake weitere Personen an, um ihre Termine dazuzuschalten. Alle anzeigen zeigt den gesamten Teamkalender. Die Teamansicht startet mit allen Personen; danach kannst du sie einschränken. Zurück in der persönlichen Ansicht gilt wieder deine vorige Auswahl. Ohne angehakte Personen bleibt der Kalender leer. Der Superadmin wählt zuerst Personen oder Alle anzeigen.",
      "Als Teammitglied kannst du Termine und Dienste in deinem eigenen Kalender anlegen, bearbeiten, verschieben und löschen. Admins können auch Einträge für andere Personen und mehrere Personen zugleich planen. Wähle Zeitraum und eine vorhandene Kalenderart. Der Titel darf leer bleiben: dann wird das Stück oder die Kalenderart angezeigt. Ganztägige Arten brauchen nur Von- und Bis-Tage, keine Uhrzeiten.",
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
      "Pausiere den Timer bei Bedarf. Stoppen & buchen legt die Zeitbuchung an. Timer verwerfen entfernt einen ungebuchten Lauf nach Bestätigung.",
      "Wähle bei einer Buchung Bearbeiten, um Datum, Dauer, Beginn, Ende oder Pause zu korrigieren. Alle Rollen können eigene Zeiten ändern; Admins auch Zeiten anderer Teammitglieder. Korrigierte Produktionswochen werden bei Bedarf erneut zur Prüfung geöffnet.",
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
      "Wähle Privater Chat und eine Person oder mehrere Personen für eine Gruppe. Private Verläufe und Dateien sehen nur die Teilnehmenden, auch Admins benötigen eine Teilnahme.",
      "Eigene Nachrichten kannst du bearbeiten oder löschen. Der Ersteller eines privaten Chats verwaltet Namen und Gruppenmitglieder oder archiviert ihn. Archivierte Chats bleiben lesbar und lassen sich wieder öffnen. Beim Chatwechsel werden ungesendete Texte und Anhänge verworfen.",
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
    "Ins Teamboard. Aufgaben zu einem Stück werden direkt unter dessen Aufgaben & Sprints angelegt.",
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
