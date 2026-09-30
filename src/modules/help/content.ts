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
    intro: "Ein Produktionsarbeitsraum bündelt die Zusammenarbeit zu einem Stück.",
    steps: [
      "Öffne Produktionen und wähle ein Stück. Admins können neue Produktionen anlegen und bestehende bearbeiten oder archivieren.",
      "Unter Team & Kontakte lassen sich Rollen frei benennen, etwa Regie, Kostüm oder Maskenbetreuung. Externe Namen benötigen keinen Account.",
      "Eine Maskenbetreuung kann ein aktives Teammitglied oder ein frei eingetragener Name sein. Ein ausgewähltes Teammitglied gehört automatisch zum Produktionsteam.",
      "Weitere Teammitglieder lassen sich getrennt hinzufügen. Um eine verknüpfte Maskenbetreuung aus dem Team zu entfernen, zuerst den Kontakt entfernen oder auf einen freien Namen umstellen.",
      "Bei einer Wiederaufnahme kann ein Admin die Produktion kopieren. Prüft anschließend Termine, Aufgaben und fachliche Angaben für die neue Spielzeit.",
    ],
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
      "Admins planen Sprints innerhalb der Produktion mit frei gewähltem Start, Ende und Ziel. Die Sprintauswahl filtert das Board.",
      "Teammitglieder bearbeiten eigene oder ihnen zugeteilte Aufgaben; andere Aufgaben bleiben einsehbar.",
    ],
  },
  {
    id: "casting",
    title: "Figuren, Besetzung & Bilder",
    module: "productions",
    intro: "Figuren und Schauspieler werden innerhalb einer Produktion zugeordnet.",
    steps: [
      "Öffne im Stück Figuren & Besetzung. Unter Figuren & Bilder legt ein Admin eine Figur mit Beschreibung an.",
      "Speichere den Eintrag zuerst. Die Detailansicht öffnet sich anschließend mit Bilder & Dateien. Dort können mehrere Bilder zugleich hochgeladen werden.",
      "Lege unter Besetzung die Zuordnung von Figur und Schauspieler an; markiere bei Bedarf eine alternierende Besetzung. Auch Besetzungen haben eine eigene Galerie.",
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
      "Admins legen Schauspieler an und pflegen Name, Kontakt, Haare, Perückenmaß und wichtige Hinweise.",
      "Öffne einen Katalogeintrag, um mehrere Fotos und Dateien hochzuladen oder vorhandene Bilder anzusehen.",
      "Produktionsbesetzungen verwenden die Schauspieler aus diesem Katalog. So müssen Stammdaten nicht für jedes Stück neu erfasst werden.",
    ],
  },
  {
    id: "looks",
    title: "Aufschriebe, Vorlagen & Versionen",
    module: "documentation",
    intro: "Ein gemeinsames Schema macht die Maskendokumentation nachvollziehbar.",
    steps: [
      "Öffne Aufschriebe im Stück oder den gemeinsamen Sammelordner. Wähle eine Vorlage und ergänze Vorbereitung, Material, Arbeitsablauf und Wechsel.",
      "Zusätzliche Felder aus einer Vorlage erscheinen im Formular. Admins pflegen Vorlagen im Bereich Aufschriebe → Vorlagen.",
      "Speichere zunächst als Entwurf und ergänze Bilder in der Galerie. Ein veröffentlichter Aufschrieb wird über seinen Status kenntlich gemacht.",
      "Im Versionsverlauf lassen sich ältere Stände von Aufschrieben und Vorlagen einsehen. Eine aktualisierte Vorlage ersetzt vorhandene fachliche Angaben nicht automatisch.",
      "Verwende PDF für Ausdrucke oder offene Formate für die Weiterverarbeitung.",
    ],
  },
  {
    id: "calendar",
    title: "Kalender, Freiwünsche & Ausdrucke",
    module: "calendar",
    intro: "Die persönliche Ansicht und die Teamplanung verwenden dieselben freigegebenen Termine.",
    steps: [
      "Wähle Monat, Woche, Tag, Agenda oder Team. Blende über die Personenliste weitere Kalender ein; ohne Auswahl werden alle angezeigt.",
      "Admins legen Termine mit Zeitraum, Kategorie und beteiligten Personen an. Wiederholungen und Ausnahmen stehen im Terminformular.",
      "Teammitglieder reichen einen Freiwunsch mit Zeitraum und Begründung ein. Die Genehmigung oder Ablehnung erfolgt durch einen Admin.",
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
      "Arbeitszeit wird mit Tätigkeit und Produktionsbezug erfasst; allgemeine Arbeit benötigt keine Produktion.",
    steps: [
      "Starte den Timer mit einer Tätigkeit oder wähle Zeit nachtragen. Mit Beginn, Ende und Pause berechnet sich die Arbeitsdauer automatisch; alternativ kannst du Minuten eintragen.",
      "Pausiere den Timer bei Bedarf. Stoppen & buchen legt die Zeitbuchung an. Timer verwerfen entfernt einen ungebuchten Lauf nach Bestätigung.",
      "Öffne eine Buchung, um sie zu bearbeiten. Für freigegebene Wochen fordert ein Admin zunächst eine Korrektur an.",
      "Die Tages- und Wochensummen berücksichtigen Buchungen über Mitternacht. In einer Produktion siehst du nur deren Anteil.",
      "Reiche deine vollständige Woche im allgemeinen Bereich Zeit buchen ein. Admins geben sie frei oder fordern eine Korrektur mit Hinweis an.",
      "Offlineentwürfe liegen auf dem Gerät. Übernehme unzugeordnete Geräteentwürfe ausdrücklich in deinen Account und synchronisiere sie anschließend. Auf gemeinsam genutzten Geräten zuerst die Tätigkeit prüfen.",
    ],
  },
  {
    id: "chat",
    title: "Kommunikation & Dateien",
    module: "chat",
    intro: "Absprachen bleiben im passenden allgemeinen oder produktionseigenen Kanal.",
    steps: [
      "Nutze Maske · Allgemein für Informationen an die Abteilung oder den Projektchat für Absprachen zum Stück.",
      "Schreibe eine Nachricht oder füge Dateien hinzu. Die Anhänge sind über den jeweiligen Kanal erreichbar.",
      "Neue Nachrichten werden während eines sichtbaren, aktiven Chats regelmäßig abgefragt. Andere Bereiche aktualisieren sich nach Änderungen oder über Daten aktualisieren.",
    ],
  },
  {
    id: "inventory",
    title: "Fundus & Dienstübergaben",
    module: "inventory",
    intro: "Materialwissen und Übergaben halten den Arbeitsalltag zusammen.",
    steps: [
      "Erfasse Material mit Lagerort, Bestand und Mindestbestand. Nur Einkaufsbedarf zeigt Einträge unter der gewünschten Menge.",
      "Im Detail eines Funduseintrags findest du einen QR-Code. Er führt nach Anmeldung direkt zum Material.",
      "Ergänze bei Dienstübergaben Checklisten, offene Punkte und Hinweise für die nächste Vorstellung. Produktionsbezogene Übergaben findest du auch im Stück.",
    ],
  },
  {
    id: "roles",
    title: "Zugänge & Rollen",
    module: "settings",
    intro: "Accounts und Mitarbeiterzuordnungen erfüllen unterschiedliche Aufgaben.",
    steps: [
      "Neue Teammitglieder registrieren sich mit Benutzername und Passwort. Ein Admin gibt ihren Zugang frei.",
      "Teammitglieder buchen eigene Zeiten und stellen Freiwünsche. Admins bearbeiten Produktionsplanung und geben Wochen frei.",
      "Der Superadmin vergibt Adminrollen und bearbeitet den zentralen Feedbackverlauf. Ein Superadmin ist ein Systemkonto und erscheint nicht als neue Mitarbeiterauswahl.",
      "Passwörter werden im Profil geändert. Bei einem vergessenen Passwort erstellt ein Admin einen Wiederherstellungscode, der auf der Anmeldeseite verwendet werden kann.",
      "Wähle in deinen Einstellungen eine persönliche Akzentfarbe. Die fachlichen Farben von Terminen, Status und Produktionen behalten ihre Bedeutung.",
    ],
  },
];
export const helpFaq = [
  [
    "Warum sehe ich eine Produktion nicht?",
    "Dein Zugang muss freigegeben sein, und du benötigst die entsprechende Produktionsfreigabe. Bitte einen Admin, die Teamzuordnung zu prüfen.",
  ],
  [
    "Wo kommen allgemeine Aufgaben hin?",
    "Ins Teamboard. Aufgaben zu einem Stück werden direkt unter dessen Aufgaben & Sprints angelegt.",
  ],
  [
    "Kann eine externe Person ohne Account eingetragen werden?",
    "Ja. In den Produktionskontakten kannst du Namen und Rollen frei eingeben. Auch eine Maskenbetreuung kann als freier Name geführt werden.",
  ],
  [
    "Wie lade ich mehrere Bilder hoch?",
    "Speichere zuerst Figur, Besetzung, Schauspieler oder Aufschrieb. Öffne danach die Galerie und wähle über Hochladen mehrere Dateien.",
  ],
  [
    "Warum lässt sich eine freigegebene Woche nicht ändern?",
    "Ein Admin fordert zuerst eine Korrektur an. Danach kannst du die betreffenden Buchungen berichtigen und die Woche erneut einreichen.",
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
