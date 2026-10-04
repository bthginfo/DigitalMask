export type HelpTutorial = {
  id: string;
  title: string;
  description: string;
  guideId: string;
  platform: "ios" | "android" | "all";
  durationSeconds: number;
  bytes: number;
  video: string;
  poster: string;
  captions: string;
  steps: string[];
  schematic: boolean;
};

export const helpTutorials: HelpTutorial[] = [
  {
    id: "ios-install",
    title: "Auf dem iPhone installieren",
    description: "Safari, Home-Bildschirm und Start über das App-Symbol. Auch für iPad.",
    guideId: "app-install",
    platform: "ios",
    durationSeconds: 25,
    bytes: 128474,
    video: "/tutorials/v1/ios-install.mp4",
    poster: "/tutorials/v1/ios-install.webp",
    captions: "/tutorials/v1/ios-install.vtt",
    steps: [
      "Öffne digitalmask.vercel.app in Safari.",
      "Tippe auf Teilen, gegebenenfalls im Seitenmenü oder unter Mehr (…).",
      "Wähle Zum Home-Bildschirm beziehungsweise Zu Home-Bildschirm hinzufügen. Fehlt die Option, ergänze sie über Aktionen bearbeiten.",
      "Lass Als Web-App öffnen eingeschaltet, falls angezeigt. Tippe auf Hinzufügen.",
      "Starte DigitalMask über das neue Symbol und melde dich an. Schalte dann unter Mehr → Einstellungen die Mitteilungen ein.",
    ],
    schematic: true,
  },
  {
    id: "android-install",
    title: "Auf Android installieren",
    description: "Mit Chrome auf den Startbildschirm und anschließend die App öffnen.",
    guideId: "app-install",
    platform: "android",
    durationSeconds: 25,
    bytes: 127582,
    video: "/tutorials/v1/android-install.mp4",
    poster: "/tutorials/v1/android-install.webp",
    captions: "/tutorials/v1/android-install.vtt",
    steps: [
      "Öffne digitalmask.vercel.app in Chrome.",
      "Tippe auf App installieren, falls angeboten. Sonst öffne das Dreipunkt-Menü von Chrome.",
      "Wähle Zum Startbildschirm hinzufügen beziehungsweise Zum Home-Bildschirm hinzufügen und bestätige Installieren. Die Bezeichnung kann je nach Chrome-Version abweichen.",
      "Öffne DigitalMask über das neue App-Symbol und melde dich an.",
      "Unter Mehr → Einstellungen → Mitteilungen auf diesem Gerät kannst du Mitteilungen aktivieren und eine Testmitteilung senden.",
    ],
    schematic: true,
  },
  {
    id: "push-enable",
    title: "Handy-Mitteilungen einschalten",
    description: "Einstellungen öffnen, Mitteilungen erlauben und den Empfang prüfen.",
    guideId: "push",
    platform: "all",
    durationSeconds: 21,
    bytes: 613646,
    video: "/tutorials/v1/push-enable.mp4",
    poster: "/tutorials/v1/push-enable.webp",
    captions: "/tutorials/v1/push-enable.vtt",
    steps: [
      "Auf dem iPhone oder iPad zuerst die App installieren und über ihr Symbol öffnen; Mitteilungen werden ab iOS/iPadOS 16.4 unterstützt.",
      "Öffne Mehr und dann Einstellungen.",
      "Suche Mitteilungen auf diesem Gerät und tippe auf Mitteilungen aktivieren.",
      "Erlaube die Nachfrage deines Handys. Diese Systemabfrage wird im Video vereinfacht dargestellt.",
      "Tippe auf Testmitteilung. Prüfe den Empfang auf deinem Handy; Fokusmodus und Geräteeinstellungen können Mitteilungen stummschalten.",
    ],
    schematic: false,
  },
  {
    id: "attendance",
    title: "Anwesenheit nachtragen",
    description: "Beginn, Ende und Pause eintragen und die berechnete Zeit speichern.",
    guideId: "time",
    platform: "all",
    durationSeconds: 27,
    bytes: 723262,
    video: "/tutorials/v1/attendance.mp4",
    poster: "/tutorials/v1/attendance.webp",
    captions: "/tutorials/v1/attendance.vtt",
    steps: [
      "Öffne Zeit und den Bereich Anwesenheit im Theater.",
      "Wähle Anwesenheit nachtragen.",
      "Trage Beginn und Ende ein. Im Beispiel: 2. Oktober, 09:00 bis 15:00 Uhr.",
      "Ergänze die Pause, im Beispiel 30 Minuten.",
      "Prüfe die berechnete Zeit ohne Pause: 5,5 Stunden. Tippe auf Speichern.",
      "Über Anwesenheit bearbeiten kannst du den Eintrag später korrigieren.",
    ],
    schematic: false,
  },
];
